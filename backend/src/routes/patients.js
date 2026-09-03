const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
// Kept CLIENTE-only on purpose: this is the client's own patient tracker
// (names, session dates, payment status) — agency staff never see it, out
// of respect for patient confidentiality.
router.use(requireRole("CLIENTE"));

function ownClientId(req) {
  return req.user.clientId || null;
}

router.get("/", async (req, res) => {
  const clientId = ownClientId(req);
  if (!clientId) return res.status(400).json({ error: "Login não vinculado a um cliente." });
  const patients = await prisma.patient.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { portalUser: { select: { id: true, email: true, active: true, createdAt: true } } },
  });
  // A patient can have at most one portal login (enforced on create) — flatten
  // the array relation into a single `portalUser` field so the frontend
  // (Kanban board + the dedicated "Acessos" tab) doesn't need a second request
  // per patient just to know whether a login exists.
  res.json(patients.map(({ portalUser, ...p }) => ({ ...p, portalUser: portalUser[0] || null })));
});

router.post("/", async (req, res) => {
  const clientId = ownClientId(req);
  if (!clientId) return res.status(400).json({ error: "Login não vinculado a um cliente." });
  const { name, contact, status, sessionValue, paymentDueDay, paymentStatus, nextSessionAt, notes, weekdays, sessionTime, meetLink } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome do paciente é obrigatório." });
  const patient = await prisma.patient.create({
    data: {
      clientId,
      name,
      contact: contact || null,
      status: status || "avaliacao",
      sessionValue: sessionValue !== undefined && sessionValue !== "" ? Number(sessionValue) : null,
      paymentDueDay: paymentDueDay !== undefined && paymentDueDay !== "" ? Number(paymentDueDay) : null,
      paymentStatus: paymentStatus || "EM_DIA",
      nextSessionAt: nextSessionAt ? new Date(nextSessionAt) : null,
      notes: notes || null,
      weekdays: Array.isArray(weekdays) ? weekdays.map(Number).filter((d) => d >= 0 && d <= 6) : [],
      sessionTime: sessionTime || null,
      meetLink: meetLink || null,
    },
  });
  res.status(201).json(patient);
});

async function assertOwnPatient(req, id) {
  const clientId = ownClientId(req);
  if (!clientId) return null;
  const patient = await prisma.patient.findFirst({ where: { id, clientId } });
  return patient;
}

router.patch("/:id", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const {
    name, contact, status, sessionValue, paymentDueDay, paymentStatus, nextSessionAt, notes, weekdays, sessionTime, meetLink,
    approveRequest, declineRequest,
  } = req.body || {};

  const data = {
    ...(name !== undefined && { name }),
    ...(contact !== undefined && { contact }),
    ...(status !== undefined && { status }),
    ...(sessionValue !== undefined && { sessionValue: sessionValue !== "" ? Number(sessionValue) : null }),
    ...(paymentDueDay !== undefined && { paymentDueDay: paymentDueDay !== "" ? Number(paymentDueDay) : null }),
    ...(paymentStatus !== undefined && { paymentStatus }),
    ...(nextSessionAt !== undefined && { nextSessionAt: nextSessionAt ? new Date(nextSessionAt) : null }),
    ...(notes !== undefined && { notes }),
    ...(weekdays !== undefined && { weekdays: Array.isArray(weekdays) ? weekdays.map(Number).filter((d) => d >= 0 && d <= 6) : [] }),
    ...(sessionTime !== undefined && { sessionTime: sessionTime || null }),
    ...(meetLink !== undefined && { meetLink: meetLink || null }),
  };

  // Patient asked (from their own portal) to move their next session — the
  // professional approves (adopts the requested date/time) or declines (just
  // dismisses it); either way the pending request is cleared.
  if (approveRequest && existing.requestedSessionAt) {
    data.nextSessionAt = existing.requestedSessionAt;
    data.requestedSessionAt = null;
    data.requestNote = null;
  } else if (declineRequest) {
    data.requestedSessionAt = null;
    data.requestNote = null;
  }

  const patient = await prisma.patient.update({ where: { id: req.params.id }, data });
  res.json(patient);
});

router.delete("/:id", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  await prisma.patient.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

router.get("/:id/notes", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const notes = await prisma.patientNote.findMany({
    where: { patientId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

router.post("/:id/notes", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: "Escreva o conteúdo do relatório." });
  const note = await prisma.patientNote.create({ data: { patientId: req.params.id, content } });
  res.status(201).json(note);
});

// Toggles whether one report/session-note entry shows up in the patient's
// own portal — private (professional-only) by default.
router.patch("/:id/notes/:noteId", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const { visibleToPatient } = req.body || {};
  const note = await prisma.patientNote.updateMany({
    where: { id: req.params.noteId, patientId: req.params.id },
    data: { ...(visibleToPatient !== undefined && { visibleToPatient: !!visibleToPatient }) },
  });
  if (note.count === 0) return res.status(404).json({ error: "Relatório não encontrado." });
  res.json({ ok: true });
});

// Activities (homework/tasks) the professional assigns between sessions.
router.get("/:id/activities", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const activities = await prisma.patientActivity.findMany({
    where: { patientId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(activities);
});

router.post("/:id/activities", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const { title, description, dueDate } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Título da atividade é obrigatório." });
  const activity = await prisma.patientActivity.create({
    data: { patientId: req.params.id, title, description: description || null, dueDate: dueDate ? new Date(dueDate) : null },
  });
  res.status(201).json(activity);
});

router.patch("/:id/activities/:activityId", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const { title, description, status, dueDate } = req.body || {};
  const result = await prisma.patientActivity.updateMany({
    where: { id: req.params.activityId, patientId: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(status !== undefined && { status }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
  });
  if (result.count === 0) return res.status(404).json({ error: "Atividade não encontrada." });
  res.json({ ok: true });
});

router.delete("/:id/activities/:activityId", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  await prisma.patientActivity.deleteMany({ where: { id: req.params.activityId, patientId: req.params.id } });
  res.status(204).end();
});

// Patient's own journal entries ("como foi seu dia") — read-only for the
// professional, written only from the patient's own portal.
router.get("/:id/journal", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const journal = await prisma.patientJournalEntry.findMany({
    where: { patientId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(journal);
});

// --- Patient portal login management (create/reset/deactivate/remove) ---
// The professional self-serves this from their own PatientsBoard — a login
// gives that one patient access to their own scoped portal, nothing else.

router.get("/:id/portal-user", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const portalUser = await prisma.user.findFirst({
    where: { patientId: req.params.id, role: "PACIENTE" },
    select: { id: true, name: true, email: true, active: true, createdAt: true },
  });
  res.json(portalUser || null);
});

router.post("/:id/portal-user", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const { name, email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email e senha são obrigatórios." });
  const already = await prisma.user.findFirst({ where: { patientId: req.params.id, role: "PACIENTE" } });
  if (already) return res.status(409).json({ error: "Esse paciente já tem um login — redefina a senha em vez de criar outro." });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const portalUser = await prisma.user.create({
      data: { name: name || existing.name, email: email.toLowerCase().trim(), passwordHash, role: "PACIENTE", patientId: req.params.id },
      select: { id: true, name: true, email: true, active: true, createdAt: true },
    });
    res.status(201).json(portalUser);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Já existe um login com esse email." });
    throw err;
  }
});

router.patch("/:id/portal-user", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  const { password, active } = req.body || {};
  const data = { ...(active !== undefined && { active: !!active }) };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  const result = await prisma.user.updateMany({ where: { patientId: req.params.id, role: "PACIENTE" }, data });
  if (result.count === 0) return res.status(404).json({ error: "Esse paciente ainda não tem login." });
  res.json({ ok: true });
});

router.delete("/:id/portal-user", async (req, res) => {
  const existing = await assertOwnPatient(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente não encontrado." });
  await prisma.user.deleteMany({ where: { patientId: req.params.id, role: "PACIENTE" } });
  res.status(204).end();
});

module.exports = router;
