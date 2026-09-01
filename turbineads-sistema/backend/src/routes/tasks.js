const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertClientInScope(user, clientId) {
  if (user.role === "SOCIO") return true;
  if (user.role === "GESTOR") {
    const client = await prisma.client.findFirst({ where: { id: clientId, gestorId: user.id } });
    return !!client;
  }
  return false;
}

router.get("/", async (req, res) => {
  const where = req.user.role === "SOCIO" ? {} : { gestorId: req.user.id };
  const tasks = await prisma.task.findMany({
    where,
    include: { client: { select: { id: true, name: true } }, gestor: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  res.json(tasks);
});

router.post("/", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const { title, description, dueDate, priority, clientId, gestorId } = req.body || {};
  if (!title || !clientId) return res.status(400).json({ error: "Título e cliente são obrigatórios." });

  if (!(await assertClientInScope(req.user, clientId))) {
    return res.status(403).json({ error: "Você não tem acesso a esse cliente." });
  }

  // A gestor can only create tasks for themself; a sócio can assign to anyone.
  const finalGestorId = req.user.role === "GESTOR" ? req.user.id : (gestorId || null);

  const task = await prisma.task.create({
    data: {
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || "MEDIA",
      clientId,
      gestorId: finalGestorId,
    },
  });
  res.status(201).json(task);
});

router.patch("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Tarefa não encontrada." });
  if (req.user.role === "GESTOR" && existing.gestorId !== req.user.id) {
    return res.status(403).json({ error: "Você não tem acesso a essa tarefa." });
  }

  const { title, description, dueDate, status, priority } = req.body || {};
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
    },
  });
  res.json(task);
});

router.delete("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Tarefa não encontrada." });
  if (req.user.role === "GESTOR" && existing.gestorId !== req.user.id) {
    return res.status(403).json({ error: "Você não tem acesso a essa tarefa." });
  }
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
