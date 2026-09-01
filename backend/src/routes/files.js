const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ~6MB raw file (base64 grows the stored string ~33%) — keeps rows sane on Postgres.
const MAX_BYTES = 6 * 1024 * 1024;

async function assertClientAccess(user, clientId) {
  if (user.role === "SOCIO") return true;
  if (user.role === "GESTOR") {
    const c = await prisma.client.findFirst({ where: { id: clientId, gestorId: user.id } });
    return !!c;
  }
  if (user.role === "CLIENTE") return user.clientId === clientId;
  return false;
}

router.get("/:clientId", async (req, res) => {
  if (!(await assertClientAccess(req.user, req.params.clientId))) {
    return res.status(403).json({ error: "Sem acesso a esse cliente." });
  }
  const files = await prisma.clientFile.findMany({
    where: { clientId: req.params.clientId },
    select: { id: true, name: true, mimeType: true, category: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(files);
});

router.get("/download/:id", async (req, res) => {
  const file = await prisma.clientFile.findUnique({ where: { id: req.params.id } });
  if (!file) return res.status(404).json({ error: "Arquivo não encontrado." });
  if (!(await assertClientAccess(req.user, file.clientId))) {
    return res.status(403).json({ error: "Sem acesso a esse arquivo." });
  }
  res.json(file);
});

router.post("/:clientId", async (req, res) => {
  if (!(await assertClientAccess(req.user, req.params.clientId))) {
    return res.status(403).json({ error: "Sem acesso a esse cliente." });
  }
  const { name, mimeType, dataBase64, category } = req.body || {};
  if (!name || !mimeType || !dataBase64) {
    return res.status(400).json({ error: "Nome, tipo e conteúdo do arquivo são obrigatórios." });
  }
  const size = Math.ceil((dataBase64.length * 3) / 4);
  if (size > MAX_BYTES) return res.status(413).json({ error: "Arquivo muito grande (limite de ~6MB)." });

  // Clients may only host their own photos through the portal — scripts and
  // other categories stay staff-managed.
  const finalCategory = req.user.role === "CLIENTE" ? "FOTO" : category || "OUTRO";

  const file = await prisma.clientFile.create({
    data: { clientId: req.params.clientId, name, mimeType, dataBase64, category: finalCategory, size },
  });
  const { dataBase64: _omit, ...meta } = file;
  res.status(201).json(meta);
});

router.delete("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const file = await prisma.clientFile.findUnique({ where: { id: req.params.id } });
  if (!file) return res.status(404).json({ error: "Arquivo não encontrado." });
  if (!(await assertClientAccess(req.user, file.clientId))) {
    return res.status(403).json({ error: "Sem acesso a esse arquivo." });
  }
  await prisma.clientFile.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
