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
  if (user.role === "CLIENTE") return { id: user.clientId || "__none__" };
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

// Curated, read-only view for the client portal — no internal notes, no
// internal task list, just what the client is meant to see about themselves.
router.get("/me/portal", requireRole("CLIENTE"), async (req, res) => {
  if (!req.user.clientId) return res.status(404).json({ error: "Login não vinculado a um cliente." });
  const client = await prisma.client.findUnique({
    where: { id: req.user.clientId },
    include: {
      gestor: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" } },
    },
  });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  const { notes, ...safe } = client;
  res.json(safe);
});

router.get("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
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
  const { name, niche, status, plan, monthlyValue, dailyAdBudget, startDate, gestorId, notes, optimizationDay, activeCreative, planType } = req.body || {};
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
      notes: notes || null,
      optimizationDay: optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null,
      activeCreative: activeCreative || null,
      planType: planType === "SO_SISTEMA" ? "SO_SISTEMA" : "COMPLETO",
    },
  });
  res.status(201).json(client);
});

// Self-service white-label branding for the client's OWN patients' portal —
// the client (professional) sets this from their own portal, not a sócio.
// Never touches planType, which stays a commercial decision made by a sócio.
router.patch("/me/branding", requireRole("CLIENTE"), async (req, res) => {
  if (!req.user.clientId) return res.status(400).json({ error: "Login não vinculado a um cliente." });
  const { brandName, logoBase64, logoMimeType } = req.body || {};
  if (logoBase64 && logoBase64.length > 3_000_000) {
    return res.status(400).json({ error: "Imagem muito grande — use um arquivo menor (até ~2MB)." });
  }
  const client = await prisma.client.update({
    where: { id: req.user.clientId },
    data: {
      ...(brandName !== undefined && { brandName: brandName || null }),
      ...(logoBase64 !== undefined && { logoBase64: logoBase64 || null }),
      ...(logoMimeType !== undefined && { logoMimeType: logoMimeType || null }),
    },
    select: { id: true, brandName: true, logoBase64: true, logoMimeType: true },
  });
  res.json(client);
});

router.patch("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  // A gestor may only touch their own clients, and only a limited field set:
  // day-to-day notes plus the two fields they're responsible for operationally.
  if (req.user.role === "GESTOR") {
    const owned = await prisma.client.findFirst({ where: { id: req.params.id, gestorId: req.user.id } });
    if (!owned) return res.status(403).json({ error: "Você não tem acesso a esse cliente." });
    const { notes, optimizationDay, activeCreative } = req.body || {};
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(notes !== undefined && { notes }),
        ...(optimizationDay !== undefined && { optimizationDay: optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null }),
        ...(activeCreative !== undefined && { activeCreative: activeCreative || null }),
      },
    });
    return res.json(client);
  }

  const { name, niche, status, plan, monthlyValue, dailyAdBudget, startDate, gestorId, notes, optimizationDay, activeCreative, planType } = req.body || {};
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
        ...(notes !== undefined && { notes }),
        ...(optimizationDay !== undefined && { optimizationDay: optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null }),
        ...(activeCreative !== undefined && { activeCreative: activeCreative || null }),
        ...(planType !== undefined && { planType: planType === "SO_SISTEMA" ? "SO_SISTEMA" : "COMPLETO" }),
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
