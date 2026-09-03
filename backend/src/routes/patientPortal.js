const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { computeSessionSchedule } = require("../utils/sessionSchedule");

const router = express.Router();
router.use(requireAuth);
// A patient's own portal — scoped to exactly the one Patient record their
// login is tied to (req.user.patientId). Never sees the professional's other
// patients, the agency, or anything outside their own data.
router.use(requireRole("PACIENTE"));

function ownPatientId(req) {
  return req.user.patientId || null;
}

// Own patient record + the professional's (client's) white-label branding —
// this is what lets the portal show the clinic's own logo instead of TurbinaADS.
router.get("/me", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { client: { select: { name: true, brandName: true, logoBase64: true, logoMimeType: true } } },
  });
  if (!patient) return res.status(404).json({ error: "Paciente não encontrado." });
  const { notes, ...safe } = patient; // internal notes field stays professional-only
  res.json({ ...safe, sessionSchedule: computeSessionSchedule(patient) });
});

router.get("/notes", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const notes = await prisma.patientNote.findMany({
    where: { patientId, visibleToPatient: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

router.post("/request-session", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const { requestedSessionAt, requestNote } = req.body || {};
  if (!requestedSessionAt) return res.status(400).json({ error: "Escolha a data/horário desejado." });
  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: { requestedSessionAt: new Date(requestedSessionAt), requestNote: requestNote || null },
  });
  res.json(patient);
});

router.delete("/request-session", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  await prisma.patient.update({ where: { id: patientId }, data: { requestedSessionAt: null, requestNote: null } });
  res.status(204).end();
});

router.get("/activities", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const activities = await prisma.patientActivity.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } });
  res.json(activities);
});

router.patch("/activities/:id", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const { status } = req.body || {};
  const result = await prisma.patientActivity.updateMany({
    where: { id: req.params.id, patientId },
    data: { ...(status !== undefined && { status }) },
  });
  if (result.count === 0) return res.status(404).json({ error: "Atividade não encontrada." });
  res.json({ ok: true });
});

router.get("/journal", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const journal = await prisma.patientJournalEntry.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } });
  res.json(journal);
});

router.post("/journal", async (req, res) => {
  const patientId = ownPatientId(req);
  if (!patientId) return res.status(400).json({ error: "Login não vinculado a um paciente." });
  const { mood, note } = req.body || {};
  if (!mood && (!note || !note.trim())) return res.status(400).json({ error: "Escolha como foi seu dia ou escreva algo." });
  const entry = await prisma.patientJournalEntry.create({ data: { patientId, mood: mood || null, note: note || null } });
  res.status(201).json(entry);
});

module.exports = router;
