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
  const where = req.user.role === "SOCIO" ? {} : { client: { gestorId: req.user.id } };
  const pendencies = await prisma.pendency.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(pendencies);
});

router.post("/", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const { clientId, description, type } = req.body || {};
  if (!clientId || !description) return res.status(400).json({ error: "Cliente e descrição são obrigatórios." });
  if (!(await assertClientInScope(req.user, clientId))) {
    return res.status(403).json({ error: "Você não tem acesso a esse cliente." });
  }
  const pendency = await prisma.pendency.create({ data: { clientId, description, type } });
  res.status(201).json(pendency);
});

router.patch("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const { status, description, type } = req.body || {};
  try {
    const pendency = await prisma.pendency.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
      },
    });
    res.json(pendency);
  } catch (err) {
    res.status(404).json({ error: "Pendência não encontrada." });
  }
});

module.exports = router;
