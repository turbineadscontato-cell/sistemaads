const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Saldo de um gestor = soma das comissões (R$50 por serviço aceito) menos
// soma dos saques já APROVADOS. Sempre recalculado a partir do histórico —
// nunca um campo solto que possa dessincronizar.
async function balanceFor(gestorId) {
  const [commissions, withdrawals] = await Promise.all([
    prisma.commission.aggregate({ where: { gestorId }, _sum: { amount: true } }),
    prisma.withdrawalRequest.aggregate({ where: { gestorId, status: "APROVADA" }, _sum: { amount: true } }),
  ]);
  const totalCommissions = commissions._sum.amount || 0;
  const totalWithdrawn = withdrawals._sum.amount || 0;
  return { totalCommissions, totalWithdrawn, balance: totalCommissions - totalWithdrawn };
}

// Gestor: o próprio financeiro — saldo atual, histórico de comissões
// recebidas e de pedidos de saque (aprovados, recusados e pendentes).
router.get("/me", requireRole("GESTOR", "SOCIO"), async (req, res) => {
  const gestorId = req.user.id;
  const [balance, commissions, withdrawals] = await Promise.all([
    balanceFor(gestorId),
    prisma.commission.findMany({ where: { gestorId }, orderBy: { createdAt: "desc" }, include: { client: { select: { id: true, name: true } } } }),
    prisma.withdrawalRequest.findMany({ where: { gestorId }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ ...balance, commissions, withdrawals });
});

// Gestor solicita retirada de emergência — fica pendente até o sócio decidir.
router.post("/withdrawals", requireRole("GESTOR", "SOCIO"), async (req, res) => {
  const { amount, note } = req.body || {};
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: "Informe um valor válido." });

  const { balance } = await balanceFor(req.user.id);
  if (value > balance) {
    return res.status(400).json({ error: `Saldo insuficiente — disponível: R$ ${balance.toFixed(2)}.` });
  }

  const withdrawal = await prisma.withdrawalRequest.create({
    data: { amount: value, note: note || null, gestorId: req.user.id },
  });
  res.status(201).json(withdrawal);
});

// Sócio: todas as solicitações de saque de todos os gestores — a aba
// Financeiro usa isso pra notificar e listar os pedidos pendentes.
router.get("/withdrawals", requireRole("SOCIO"), async (req, res) => {
  const withdrawals = await prisma.withdrawalRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { gestor: { select: { id: true, name: true, avatarUrl: true } } },
  });
  res.json(withdrawals);
});

// Sócio aprova ou recusa um pedido de saque. Aprovar desconta do saldo do
// gestor automaticamente (o saldo é sempre recalculado a partir do histórico
// de comissões menos saques aprovados — não precisa "subtrair" nada à mão).
router.patch("/withdrawals/:id", requireRole("SOCIO"), async (req, res) => {
  const { status } = req.body || {};
  if (!["APROVADA", "RECUSADA"].includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }
  const existing = await prisma.withdrawalRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (existing.status !== "SOLICITADA") {
    return res.status(400).json({ error: "Essa solicitação já foi decidida." });
  }

  if (status === "APROVADA") {
    const { balance } = await balanceFor(existing.gestorId);
    if (existing.amount > balance) {
      return res.status(400).json({ error: `Saldo do gestor insuficiente pra aprovar esse valor — disponível: R$ ${balance.toFixed(2)}.` });
    }
  }

  const withdrawal = await prisma.withdrawalRequest.update({
    where: { id: req.params.id },
    data: { status, resolvedAt: new Date() },
  });
  res.json(withdrawal);
});

// Sócio: resumo financeiro por gestor — total de comissão gerada, total já
// repassado (saques aprovados) e saldo atual de cada um. Base da aba
// Financeiro no painel.
router.get("/summary", requireRole("SOCIO"), async (req, res) => {
  const gestores = await prisma.user.findMany({
    where: { role: { in: ["GESTOR", "SOCIO"] }, active: true },
    select: { id: true, name: true, avatarUrl: true, rank: true },
    orderBy: { name: "asc" },
  });
  const rows = await Promise.all(
    gestores.map(async (g) => ({ ...g, ...(await balanceFor(g.id)) }))
  );
  const pendingWithdrawals = await prisma.withdrawalRequest.count({ where: { status: "SOLICITADA" } });
  res.json({ gestores: rows, pendingWithdrawals });
});

module.exports = router;
