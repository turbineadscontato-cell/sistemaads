const express = require("express");
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
  });
  res.json(patients);
});

router.post("/", async (req, res) => {
  const clientId = ownClientId(req);
  if (!clientId) return res.status(400).json({ error: "Login não vinculado a um cliente." });
  const { name, contact, status, sessionValue, paymentDueDay, paymentStatus, nextSessionAt, notes, weekdays, sessionTime } = req.body || {};
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
  const { name, contact, status, sessionValue, paymentDueDay, paymentStatus, nextSessionAt, notes, weekdays, sessionTime } = req.body || {};
  const patient = await prisma.patient.update({
    where: { id: req.params.id },
    data: {
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
    },
  });
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

module.exports = router;
