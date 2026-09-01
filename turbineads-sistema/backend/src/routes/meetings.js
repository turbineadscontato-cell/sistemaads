const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("SOCIO", "ATENDENTE"));

router.get("/", async (req, res) => {
  const meetings = await prisma.meeting.findMany({
    include: { lead: { select: { id: true, name: true } }, responsavel: { select: { id: true, name: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  res.json(meetings);
});

router.post("/", async (req, res) => {
  const { leadId, scheduledAt, notes } = req.body || {};
  if (!scheduledAt) return res.status(400).json({ error: "Data/hora da reunião é obrigatória." });
  const meeting = await prisma.meeting.create({
    data: { leadId: leadId || null, scheduledAt: new Date(scheduledAt), notes, responsavelId: req.user.id },
  });
  res.status(201).json(meeting);
});

router.patch("/:id", async (req, res) => {
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
