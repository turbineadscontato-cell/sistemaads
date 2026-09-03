const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("SOCIO", "GESTOR", "CLIENTE"));

// A client's own mini-CRM. CLIENTE always operates on their own linked
// client; SOCIO/GESTOR pass ?clientId= to look at a specific client's leads.
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
  const leads = await prisma.clientLead.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  res.json(leads);
});

router.post("/", async (req, res) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: "Cliente não informado ou sem acesso." });
  const { name, contact, origin, status, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome do lead é obrigatório." });
  const lead = await prisma.clientLead.create({
    data: { clientId, name, contact, origin, status: status || "novo", notes },
  });
  res.status(201).json(lead);
});

async function authorizeLead(req, existing) {
  if (req.user.role === "CLIENTE") return existing.clientId === req.user.clientId;
  if (req.user.role === "GESTOR") {
    const owned = await prisma.client.findFirst({ where: { id: existing.clientId, gestorId: req.user.id } });
    return !!owned;
  }
  return true; // SOCIO
}

router.patch("/:id", async (req, res) => {
  const existing = await prisma.clientLead.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lead não encontrado." });
  if (!(await authorizeLead(req, existing))) return res.status(403).json({ error: "Sem acesso a esse lead." });

  const { name, contact, origin, status, notes } = req.body || {};
  const lead = await prisma.clientLead.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(contact !== undefined && { contact }),
      ...(origin !== undefined && { origin }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    },
  });
  res.json(lead);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.clientLead.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lead não encontrado." });
  if (!(await authorizeLead(req, existing))) return res.status(403).json({ error: "Sem acesso a esse lead." });
  await prisma.clientLead.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
