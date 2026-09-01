const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Everyone logged in can see the list of gestores (needed to assign clients/tasks),
// but only a sócio can see full user management or create/deactivate accounts.
router.get("/gestores", async (req, res) => {
  const gestores = await prisma.user.findMany({
    where: { role: "GESTOR", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  res.json(gestores);
});

router.get("/", requireRole("SOCIO"), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

router.post("/", requireRole("SOCIO"), async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Nome, email, senha e papel são obrigatórios." });
  }
  if (!["SOCIO", "GESTOR", "ATENDENTE"].includes(role)) {
    return res.status(400).json({ error: "Papel inválido." });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase().trim(), passwordHash, role },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Já existe um usuário com esse email." });
    throw err;
  }
});

router.patch("/:id", requireRole("SOCIO"), async (req, res) => {
  const { name, role, active, password } = req.body || {};
  const data = {
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
    ...(active !== undefined && { active }),
  };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    res.json(user);
  } catch (err) {
    res.status(404).json({ error: "Usuário não encontrado." });
  }
});

module.exports = router;
