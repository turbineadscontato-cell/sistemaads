const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// SOCIO sees every client. GESTOR sees only clients assigned to them.
// ATENDENTE has no access to the closed client portfolio (their tools live under /leads).
function scopeFilter(user) {
  if (user.role === "SOCIO") return {};
  if (user.role === "GESTOR") return { gestorId: user.id };
  return { id: "__none__" }; // ATENDENTE: matches nothing
}

router.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: scopeFilter(req.user),
    include: {
      gestor: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" }, take: 1 },
      pendencies: { where: { status: "ABERTA" }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });
  // Shape the response so the frontend gets a simple count without depending
  // on Prisma's filtered-relation-count feature (version-sensitive).
  const withCounts = clients.map(({ pendencies, ...c }) => ({ ...c, openPendencies: pendencies.length }));
  res.json(withCounts);
});

router.get("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, ...scopeFilter(req.user) },
    include: {
      gestor: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" } },
      tasks: { orderBy: { dueDate: "asc" } },
      pendencies: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  res.json(client);
});

// Only sócios create/edit/delete clients and reassign gestores.
router.post("/", requireRole("SOCIO"), async (req, res) => {
  const { name, niche, status, plan, monthlyValue, dailyAdBudget, startDate, gestorId } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome do cliente é obrigatório." });

  const client = await prisma.client.create({
    data: {
      name,
      niche,
      status: status || "ONBOARDING",
      plan,
      monthlyValue: monthlyValue != null ? Number(monthlyValue) : null,
      dailyAdBudget: dailyAdBudget != null ? Number(dailyAdBudget) : null,
      startDate: startDate ? new Date(startDate) : null,
      gestorId: gestorId || null,
    },
  });
  res.status(201).json(client);
});

router.patch("/:id", requireRole("SOCIO"), async (req, res) => {
  const { name, niche, status, plan, monthlyValue, dailyAdBudget, startDate, gestorId } = req.body || {};
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(niche !== undefined && { niche }),
        ...(status !== undefined && { status }),
        ...(plan !== undefined && { plan }),
        ...(monthlyValue !== undefined && { monthlyValue: monthlyValue != null ? Number(monthlyValue) : null }),
        ...(dailyAdBudget !== undefined && { dailyAdBudget: dailyAdBudget != null ? Number(dailyAdBudget) : null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(gestorId !== undefined && { gestorId: gestorId || null }),
      },
    });
    res.json(client);
  } catch (err) {
    res.status(404).json({ error: "Cliente não encontrado." });
  }
});

router.delete("/:id", requireRole("SOCIO"), async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: "Cliente não encontrado." });
  }
});

module.exports = router;
