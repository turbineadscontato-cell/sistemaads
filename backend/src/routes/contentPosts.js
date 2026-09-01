const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("SOCIO", "GESTOR", "CLIENTE"));

// The client's own marketing/content calendar. CLIENTE always operates on
// their own client; SOCIO/GESTOR pass ?clientId= to look at one client's
// calendar for context (not sensitive like patient data, so staff may view it).
async function resolveClientId(req) {
  if (req.user.role === "CLIENTE") return req.user.clientId || null;
  const clientId = req.query.clientId || req.body?.clientId;
  if (!clientId) return null;
  if (req.user.role === "SOCIO") return clientId;
  const owned = await prisma.client.findFirst({ where: { id: clientId, gestorId: req.user.id } });
  return owned ? clientId : null;
}

router.get("/", async (req, res) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: "Cliente não informado ou sem acesso." });
  const posts = await prisma.contentPost.findMany({ where: { clientId }, orderBy: { scheduledDate: "asc" } });
  res.json(posts);
});

router.post("/", async (req, res) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: "Cliente não informado ou sem acesso." });
  const { scheduledDate, title, theme, status, notes } = req.body || {};
  if (!scheduledDate || !title) return res.status(400).json({ error: "Data e título são obrigatórios." });
  const post = await prisma.contentPost.create({
    data: { clientId, scheduledDate: new Date(scheduledDate), title, theme: theme || null, status: status || "planejado", notes: notes || null },
  });
  res.status(201).json(post);
});

// Bulk-create — used by the "salvar tudo no calendário" action after the AI
// proposes a batch of post ideas.
router.post("/bulk", async (req, res) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: "Cliente não informado ou sem acesso." });
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Nenhum item para salvar." });
  const data = items
    .filter((it) => it && it.title && it.date)
    .map((it) => ({
      clientId,
      scheduledDate: new Date(it.date),
      title: it.title,
      theme: it.theme || null,
      notes: it.caption || it.notes || null,
      status: "planejado",
    }));
  if (data.length === 0) return res.status(400).json({ error: "Nenhum item válido para salvar." });
  await prisma.contentPost.createMany({ data });
  res.status(201).json({ created: data.length });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.contentPost.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Post não encontrado." });
  if (req.user.role === "CLIENTE" && existing.clientId !== req.user.clientId) {
    return res.status(403).json({ error: "Sem acesso." });
  }
  if (req.user.role === "GESTOR") {
    const owned = await prisma.client.findFirst({ where: { id: existing.clientId, gestorId: req.user.id } });
    if (!owned) return res.status(403).json({ error: "Sem acesso." });
  }
  const { scheduledDate, title, theme, status, notes } = req.body || {};
  const post = await prisma.contentPost.update({
    where: { id: req.params.id },
    data: {
      ...(scheduledDate !== undefined && { scheduledDate: new Date(scheduledDate) }),
      ...(title !== undefined && { title }),
      ...(theme !== undefined && { theme }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    },
  });
  res.json(post);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.contentPost.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Post não encontrado." });
  if (req.user.role === "CLIENTE" && existing.clientId !== req.user.clientId) {
    return res.status(403).json({ error: "Sem acesso." });
  }
  if (req.user.role === "GESTOR") {
    const owned = await prisma.client.findFirst({ where: { id: existing.clientId, gestorId: req.user.id } });
    if (!owned) return res.status(403).json({ error: "Sem acesso." });
  }
  await prisma.contentPost.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
