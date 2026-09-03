const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Everyone logged in can see the list of gestores (needed to assign clients/tasks),
// but only a sócio can see full user management or create/deactivate accounts.
// Includes SOCIO accounts too (not just GESTOR): in practice the sócio (Elismael)
// also works client accounts directly as a traffic manager, so he needs to show
// up as an assignable "gestor" option on clients and tasks, same as any gestor.
router.get("/gestores", async (req, res) => {
  const gestores = await prisma.user.findMany({
    where: { role: { in: ["GESTOR", "SOCIO"] }, active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(gestores);
});

router.get("/", requireRole("SOCIO"), async (req, res) => {
  // Patient portal logins (role PACIENTE) are managed by the professional
  // from their own portal (see /api/patients/:id/portal-user), not here.
  const users = await prisma.user.findMany({
    where: { role: { not: "PACIENTE" } },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, clientId: true, client: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

router.post("/", requireRole("SOCIO"), async (req, res) => {
  const { name, email, password, role, clientId } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Nome, email, senha e papel são obrigatórios." });
  }
  if (!["SOCIO", "GESTOR", "ATENDENTE", "CLIENTE"].includes(role)) {
    return res.status(400).json({ error: "Papel inválido." });
  }
  if (role === "CLIENTE" && !clientId) {
    return res.status(400).json({ error: "Selecione a qual cliente esse login pertence." });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase().trim(), passwordHash, role, clientId: role === "CLIENTE" ? clientId : null },
      select: { id: true, name: true, email: true, role: true, active: true, clientId: true },
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Já existe um usuário com esse email." });
    throw err;
  }
});

router.patch("/:id", requireRole("SOCIO"), async (req, res) => {
  const { name, role, active, password, clientId } = req.body || {};
  const data = {
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
    ...(active !== undefined && { active }),
    ...(clientId !== undefined && { clientId: clientId || null }),
  };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true, clientId: true },
    });
    res.json(user);
  } catch (err) {
    res.status(404).json({ error: "Usuário não encontrado." });
  }
});

router.delete("/:id", requireRole("SOCIO"), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "Você não pode excluir seu próprio login." });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });

  if (target.role === "SOCIO") {
    const socioCount = await prisma.user.count({ where: { role: "SOCIO" } });
    if (socioCount <= 1) {
      return res.status(400).json({ error: "Não é possível excluir o único sócio do sistema." });
    }
  }

  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        error: "Este usuário está vinculado a clientes, tarefas, leads ou reuniões e não pode ser excluído. Reatribua esses vínculos ou apenas desative o login.",
      });
    }
    throw err;
  }
});

module.exports = router;
