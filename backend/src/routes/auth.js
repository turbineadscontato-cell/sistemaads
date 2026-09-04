const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { signToken, requireAuth } = require("../middleware/auth");
const { onlyDigits } = require("../utils/identifier");

const router = express.Router();

router.post("/login", async (req, res) => {
  // "identifier" é o campo novo (email, CPF ou telefone); "email" continua
  // aceito por compatibilidade com quem já tinha a tela antiga aberta.
  const identifier = (req.body?.identifier || req.body?.email || "").trim();
  const { password } = req.body || {};

  if (!identifier || !password) {
    return res.status(400).json({ error: "Informe email, CPF ou telefone e senha." });
  }

  // Email sempre tem "@"; CPF/telefone a gente compara só pelos dígitos,
  // pra funcionar independente de como a pessoa formatou ao digitar.
  let user;
  if (identifier.includes("@")) {
    user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
  } else {
    const digits = onlyDigits(identifier);
    user = digits ? await prisma.user.findFirst({ where: { OR: [{ cpf: digits }, { phone: digits }] } }) : null;
  }

  if (!user || !user.active) {
    return res.status(401).json({ error: "Login ou senha inválidos." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Login ou senha inválidos." });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.clientId || null, patientId: user.patientId || null, avatarUrl: user.avatarUrl || null, rank: user.rank || "BRONZE" },
  });
});

// Returns the current logged-in user, so the frontend can restore session on reload.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.active) return res.status(401).json({ error: "Usuário inválido." });
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.clientId || null, patientId: user.patientId || null, avatarUrl: user.avatarUrl || null, rank: user.rank || "BRONZE" });
});

// Self-service foto de perfil — qualquer login (sócio, gestor, atendente,
// cliente) troca só a própria foto. Vem como data URL (já redimensionada e
// comprimida no navegador antes do envio, então cabe folgado no limite de
// corpo JSON do servidor). Passar null remove a foto.
router.patch("/avatar", requireAuth, async (req, res) => {
  const { avatarUrl } = req.body || {};
  if (avatarUrl != null && typeof avatarUrl !== "string") {
    return res.status(400).json({ error: "Foto inválida." });
  }
  if (avatarUrl && avatarUrl.length > 3_000_000) {
    return res.status(400).json({ error: "Imagem muito grande." });
  }
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatarUrl: avatarUrl || null },
    select: { id: true, avatarUrl: true },
  });
  return res.json(user);
});

module.exports = router;
