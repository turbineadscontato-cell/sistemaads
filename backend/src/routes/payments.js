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
  const payments = await prisma.payment.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });
  res.json(payments);
});

// Payment records are financial — only sócios create/edit them.
router.post("/", requireRole("SOCIO"), async (req, res) => {
  const { clientId, amount, dueDate, status } = req.body || {};
  if (!clientId || !amount || !dueDate) {
    return res.status(400).json({ error: "Cliente, valor e vencimento são obrigatórios." });
  }
  if (!(await assertClientInScope(req.user, clientId))) {
    return res.status(403).json({ error: "Você não tem acesso a esse cliente." });
  }
  const payment = await prisma.payment.create({
    data: { clientId, amount: Number(amount), dueDate: new Date(dueDate), status: status || "PENDENTE" },
  });
  res.status(201).json(payment);
});

router.patch("/:id", requireRole("SOCIO"), async (req, res) => {
  const { amount, dueDate, status, paidDate } = req.body || {};
  try {
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(status !== undefined && { status }),
        ...(paidDate !== undefined && { paidDate: paidDate ? new Date(paidDate) : null }),
      },
    });
    res.json(payment);
  } catch (err) {
    res.status(404).json({ error: "Pagamento não encontrado." });
  }
});

module.exports = router;
