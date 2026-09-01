const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("SOCIO"));

router.get("/summary", async (req, res) => {
  const [clients, payments, leads, tasks, gestores] = await Promise.all([
    prisma.client.findMany({ select: { status: true, monthlyValue: true } }),
    prisma.payment.findMany({ select: { amount: true, status: true } }),
    prisma.lead.findMany({ select: { origin: true, status: true } }),
    prisma.task.findMany({ select: { status: true, gestorId: true } }),
    prisma.user.findMany({ where: { role: "GESTOR" }, select: { id: true, name: true } }),
  ]);

  const clientsByStatus = { ATIVO: 0, PENDENTE_PAGAMENTO: 0, ONBOARDING: 0, CANCELADO: 0 };
  let faturamentoPrevisto = 0;
  for (const c of clients) {
    clientsByStatus[c.status] = (clientsByStatus[c.status] || 0) + 1;
    if (c.status === "ATIVO" && c.monthlyValue) faturamentoPrevisto += c.monthlyValue;
  }

  let pagamentosPendentes = 0;
  let pagamentosAtrasados = 0;
  let pagamentosRecebidos = 0;
  for (const p of payments) {
    if (p.status === "PENDENTE") pagamentosPendentes += p.amount;
    else if (p.status === "ATRASADO") pagamentosAtrasados += p.amount;
    else if (p.status === "PAGO") pagamentosRecebidos += p.amount;
  }

  const originMap = {};
  const stageMap = {};
  for (const l of leads) {
    const origin = l.origin || "Não informado";
    originMap[origin] = (originMap[origin] || 0) + 1;
    stageMap[l.status] = (stageMap[l.status] || 0) + 1;
  }
  const leadsByOrigin = Object.entries(originMap)
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count);
  const leadsByStage = Object.entries(stageMap).map(([stage, count]) => ({ stage, count }));

  const gestorMap = {};
  for (const g of gestores) gestorMap[g.id] = { gestorId: g.id, gestorName: g.name, total: 0, concluidas: 0 };
  for (const t of tasks) {
    if (!t.gestorId || !gestorMap[t.gestorId]) continue;
    gestorMap[t.gestorId].total += 1;
    if (t.status === "CONCLUIDA") gestorMap[t.gestorId].concluidas += 1;
  }
  const tasksByGestor = Object.values(gestorMap).sort((a, b) => b.total - a.total);

  res.json({
    clientsByStatus,
    faturamentoPrevisto,
    pagamentosPendentes,
    pagamentosAtrasados,
    pagamentosRecebidos,
    leadsByOrigin,
    leadsByStage,
    tasksByGestor,
    totalClientes: clients.length,
    totalLeads: leads.length,
  });
});

module.exports = router;
