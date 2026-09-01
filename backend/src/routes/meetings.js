const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
// Agency CRM (sócio/atendente), gestores (their own clients) and clients
// (their own meeting requests) can all touch meetings — scoped below.
router.use(requireRole("SOCIO", "ATENDENTE", "GESTOR", "CLIENTE"));

router.get("/", async (req, res) => {
  let where = {};
  if (req.user.role === "GESTOR") where = { client: { gestorId: req.user.id } };
  else if (req.user.role === "CLIENTE") where = { clientId: req.user.clientId || "__none__" };
  else if (req.user.role === "ATENDENTE") where = {}; // atendente works the whole lead funnel

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      lead: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      responsavel: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
  res.json(meetings);
});

router.post("/", async (req, res) => {
  const { leadId, clientId, scheduledAt, notes } = req.body || {};
  if (!scheduledAt) return res.status(400).json({ error: "Data/hora da reunião é obrigatória." });

  if (req.user.role === "CLIENTE") {
    // A client can only request a meeting tied to their own account.
    const ownClientId = req.user.clientId;
    if (!ownClientId) return res.status(403).json({ error: "Login não vinculado a um cliente." });
    const client = await prisma.client.findUnique({ where: { id: ownClientId }, select: { gestorId: true } });
    const meeting = await prisma.meeting.create({
      data: {
        clientId: ownClientId,
        scheduledAt: new Date(scheduledAt),
        notes,
        status: "solicitada",
        requestedByClient: true,
        responsavelId: client?.gestorId || null,
      },
    });
    return res.status(201).json(meeting);
  }

  if (req.user.role === "GESTOR") {
    if (clientId) {
      const owned = await prisma.client.findFirst({ where: { id: clientId, gestorId: req.user.id } });
      if (!owned) return res.status(403).json({ error: "Você não tem acesso a esse cliente." });
    }
    const meeting = await prisma.meeting.create({
      data: { leadId: leadId || null, clientId: clientId || null, scheduledAt: new Date(scheduledAt), notes, responsavelId: req.user.id },
    });
    return res.status(201).json(meeting);
  }

  const meeting = await prisma.meeting.create({
    data: { leadId: leadId || null, clientId: clientId || null, scheduledAt: new Date(scheduledAt), notes, responsavelId: req.user.id },
  });
  res.status(201).json(meeting);
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.meeting.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Reunião não encontrada." });

  if (req.user.role === "CLIENTE") {
    if (existing.clientId !== req.user.clientId) return res.status(403).json({ error: "Sem acesso a essa reunião." });
  } else if (req.user.role === "GESTOR") {
    if (existing.clientId) {
      const owned = await prisma.client.findFirst({ where: { id: existing.clientId, gestorId: req.user.id } });
      if (!owned) return res.status(403).json({ error: "Sem acesso a essa reunião." });
    } else if (existing.responsavelId !== req.user.id) {
      return res.status(403).json({ error: "Sem acesso a essa reunião." });
    }
  }

  const { scheduledAt, status, notes } = req.body || {};
  try {
    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: {
        ...(scheduledAt !== undefined && { scheduledAt: new Date(scheduledAt) }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    });
    res.json(meeting);
  } catch (err) {
    res.status(404).json({ error: "Reunião não encontrada." });
  }
});

module.exports = router;
