const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
// The lead/meeting CRM is for sócios (oversight) and atendentes (day to day).
router.use(requireRole("SOCIO", "ATENDENTE"));

router.get("/", async (req, res) => {
  const leads = await prisma.lead.findMany({
    include: { atendente: { select: { id: true, name: true } }, meetings: { orderBy: { scheduledAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(leads);
});

router.post("/", async (req, res) => {
  const { name, contact, origin, status } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome do lead é obrigatório." });
  const lead = await prisma.lead.create({
    data: { name, contact, origin, status: status || "novo", atendenteId: req.user.id },
  });
  res.status(201).json(lead);
});

router.patch("/:id", async (req, res) => {
  const { name, contact, origin, status, notes } = req.body || {};
  try {
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(contact !== undefined && { contact }),
        ...(origin !== undefined && { origin }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    });
    res.json(lead);
  } catch (err) {
    res.status(404).json({ error: "Lead não encontrado." });
  }
});

// Excluir lead — sócio e atendente (mesmo time que administra o funil).
router.delete("/:id", async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: "Lead não encontrado." });
  }
});

module.exports = router;
