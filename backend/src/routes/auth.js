const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Informe email e senha." });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  if (!user || !user.active) {
    return res.status(401).json({ error: "Email ou senha inválidos." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Email ou senha inválidos." });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.clientId || null },
  });
});

// Returns the current logged-in user, so the frontend can restore session on reload.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.active) return res.status(401).json({ error: "Usuário inválido." });
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.clientId || null });
});

module.exports = router;
