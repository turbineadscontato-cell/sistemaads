const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

// ==========================================================================
// Módulo ADMINISTRAÇÃO — central financeira/administrativa interna da
// TurbinaADS (Fase 1: Dashboard, Receitas, Despesas, Clientes financeiros,
// Cobranças, Fluxo de caixa). Só sócios acessam — os dois sócios já
// existentes usam o role SOCIO, então requireRole("SOCIO") já cobre os
// dois sem precisar de nenhuma tabela de permissão nova nesta fase.
//
// Importante: isso NÃO mexe no modelo Payment já existente (usado pra
// mostrar ao cliente, no portal dele, quanto ele deve à agência). São dois
// livros separados de propósito — ver comentário no schema.prisma.
// ==========================================================================

const router = express.Router();
router.use(requireAuth, requireRole("SOCIO"));

// Comprovante de despesa em base64 — mesmo teto (com folga) já usado pro
// anexo de relatório do Meta em ClientMetricEntry.
const MAX_RECEIPT_B64_CHARS = 8_000_000;

function startOfDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function todayUTC() {
  return startOfDay(new Date());
}

// Status "ATRASADO" nunca é gravado no banco — é sempre derivado na leitura
// a partir do vencimento, igual ao padrão já usado em sessionSchedule.js pra
// pacientes. Isso evita precisar de um job rodando pra "virar" o status.
function deriveStatus(status, dueDate) {
  if (status === "PAGO" || status === "CANCELADO") return status;
  if (dueDate && startOfDay(dueDate) < todayUTC()) return "ATRASADO";
  return status;
}

function serializeRevenue(r) {
  return {
    id: r.id,
    description: r.description,
    category: r.category,
    amount: r.amount,
    dueDate: r.dueDate,
    paidDate: r.paidDate,
    paymentMethod: r.paymentMethod,
    account: r.account,
    status: deriveStatus(r.status, r.dueDate),
    recurring: r.recurring,
    recurrenceDay: r.recurrenceDay,
    notes: r.notes,
    createdAt: r.createdAt,
    client: r.client ? { id: r.client.id, name: r.client.name } : null,
    createdBy: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name } : null,
    collectionNotes: (r.collectionNotes || []).map((n) => ({
      id: n.id,
      type: n.type,
      note: n.note,
      createdAt: n.createdAt,
      createdBy: n.createdBy ? n.createdBy.name : null,
    })),
  };
}

function serializeExpense(e) {
  return {
    id: e.id,
    description: e.description,
    supplier: e.supplier,
    category: e.category,
    amount: e.amount,
    date: e.date,
    dueDate: e.dueDate,
    paidDate: e.paidDate,
    paymentMethod: e.paymentMethod,
    account: e.account,
    costCenter: e.costCenter,
    responsible: e.responsible,
    receiptName: e.receiptName,
    receiptMimeType: e.receiptMimeType,
    hasReceipt: !!e.receiptBase64,
    receiptBase64: e.receiptBase64 || null,
    notes: e.notes,
    recurring: e.recurring,
    recurrenceDay: e.recurrenceDay,
    status: deriveStatus(e.status, e.dueDate),
    createdAt: e.createdAt,
    createdBy: e.createdBy ? { id: e.createdBy.id, name: e.createdBy.name } : null,
  };
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Gera automaticamente as próximas ocorrências (até 2) de um lançamento
// recorrente, com status PREVISTO — pedido explícito na seção 5 ("criar
// automaticamente os próximos lançamentos"). Sem job/cron: só dispara no
// momento em que o lançamento recorrente é criado ou marcado como pago.
function nextRecurrenceDates(fromDate, recurrenceDay, count) {
  const dates = [];
  const base = fromDate ? new Date(fromDate) : new Date();
  let cursor = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  for (let i = 0; i < count; i++) {
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const lastDayOfMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(recurrenceDay || 1, lastDayOfMonth);
    dates.push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), day)));
  }
  return dates;
}

// ---------------------------------------------------------------------
// RECEITAS
// ---------------------------------------------------------------------

router.get("/receitas", async (req, res) => {
  const { status, category, clientId, from, to, q } = req.query;
  const where = {};
  if (category) where.category = category;
  if (clientId) where.clientId = clientId;
  if (from || to) {
    where.dueDate = {};
    if (from) where.dueDate.gte = toDateOrNull(from);
    if (to) where.dueDate.lte = toDateOrNull(to);
  }
  if (q) where.description = { contains: String(q), mode: "insensitive" };

  const rows = await prisma.adminRevenue.findMany({
    where,
    include: { client: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, collectionNotes: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  let list = rows.map(serializeRevenue);
  // status "ATRASADO" é derivado, então o filtro por status precisa ser
  // aplicado depois de calcular o valor efetivo (não dá pra fazer via where do Prisma).
  if (status && status !== "TODOS") list = list.filter((r) => r.status === status);
  res.json(list);
});

router.post("/receitas", async (req, res) => {
  const { description, category, amount, dueDate, paidDate, clientId, paymentMethod, account, status, recurring, recurrenceDay, notes } = req.body || {};
  if (!description || !String(description).trim()) return res.status(400).json({ error: "Informe a descrição." });
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: "Informe um valor válido." });
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return res.status(400).json({ error: "Cliente não encontrado." });
  }

  const created = await prisma.adminRevenue.create({
    data: {
      description: String(description).trim(),
      category: category || null,
      amount: value,
      dueDate: toDateOrNull(dueDate),
      paidDate: toDateOrNull(paidDate),
      clientId: clientId || null,
      paymentMethod: paymentMethod || null,
      account: account || null,
      status: status || "PENDENTE",
      recurring: !!recurring,
      recurrenceDay: recurring ? Number(recurrenceDay) || new Date(dueDate || Date.now()).getUTCDate() : null,
      notes: notes || null,
      createdById: req.user.id,
    },
    include: { client: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, collectionNotes: true },
  });

  if (created.recurring) {
    const nextDates = nextRecurrenceDates(created.dueDate, created.recurrenceDay, 2);
    await prisma.adminRevenue.createMany({
      data: nextDates.map((d) => ({
        description: created.description,
        category: created.category,
        amount: created.amount,
        dueDate: d,
        clientId: created.clientId,
        paymentMethod: created.paymentMethod,
        account: created.account,
        status: "PREVISTO",
        recurring: true,
        recurrenceDay: created.recurrenceDay,
        createdById: req.user.id,
      })),
    });
  }

  res.status(201).json(serializeRevenue(created));
});

router.patch("/receitas/:id", async (req, res) => {
  const existing = await prisma.adminRevenue.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  const { description, category, amount, dueDate, paidDate, clientId, paymentMethod, account, status, notes } = req.body || {};

  const data = {};
  if (description !== undefined) data.description = String(description).trim();
  if (category !== undefined) data.category = category || null;
  if (amount !== undefined) {
    const value = Number(amount);
    if (!value || value <= 0) return res.status(400).json({ error: "Informe um valor válido." });
    data.amount = value;
  }
  if (dueDate !== undefined) data.dueDate = toDateOrNull(dueDate);
  if (clientId !== undefined) data.clientId = clientId || null;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;
  if (account !== undefined) data.account = account || null;
  if (notes !== undefined) data.notes = notes || null;
  if (status !== undefined) {
    data.status = status;
    if (status === "PAGO") data.paidDate = toDateOrNull(paidDate) || new Date();
  }
  if (paidDate !== undefined && status === undefined) data.paidDate = toDateOrNull(paidDate);

  const updated = await prisma.adminRevenue.update({
    where: { id: req.params.id },
    data,
    include: { client: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, collectionNotes: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } } },
  });
  res.json(serializeRevenue(updated));
});

// "Excluir" nunca apaga um registro financeiro de verdade (seção 39 do
// pedido) — só marca como CANCELADO, preservando o histórico.
router.delete("/receitas/:id", async (req, res) => {
  const existing = await prisma.adminRevenue.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  const updated = await prisma.adminRevenue.update({
    where: { id: req.params.id },
    data: { status: "CANCELADO" },
    include: { client: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, collectionNotes: true },
  });
  res.json(serializeRevenue(updated));
});

router.post("/receitas/:id/notas", async (req, res) => {
  const existing = await prisma.adminRevenue.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  const { type, note } = req.body || {};
  if (!note || !String(note).trim()) return res.status(400).json({ error: "Escreva uma observação." });
  const created = await prisma.adminCollectionNote.create({
    data: { revenueId: req.params.id, type: type || "OUTRO", note: String(note).trim(), createdById: req.user.id },
    include: { createdBy: { select: { name: true } } },
  });
  res.status(201).json({ id: created.id, type: created.type, note: created.note, createdAt: created.createdAt, createdBy: created.createdBy?.name || null });
});

// ---------------------------------------------------------------------
// DESPESAS
// ---------------------------------------------------------------------

router.get("/despesas", async (req, res) => {
  const { status, category, from, to, q } = req.query;
  const where = {};
  if (category) where.category = category;
  if (from || to) {
    where.dueDate = {};
    if (from) where.dueDate.gte = toDateOrNull(from);
    if (to) where.dueDate.lte = toDateOrNull(to);
  }
  if (q) where.description = { contains: String(q), mode: "insensitive" };

  const rows = await prisma.adminExpense.findMany({
    where,
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  let list = rows.map(serializeExpense);
  if (status && status !== "TODOS") list = list.filter((e) => e.status === status);
  // Nunca manda o base64 inteiro na listagem (só o hasReceipt) — o arquivo
  // completo só vai no detalhe, evitando inflar a resposta da tabela.
  list = list.map((e) => ({ ...e, receiptBase64: null }));
  res.json(list);
});

router.get("/despesas/:id", async (req, res) => {
  const e = await prisma.adminExpense.findUnique({ where: { id: req.params.id }, include: { createdBy: { select: { id: true, name: true } } } });
  if (!e) return res.status(404).json({ error: "Despesa não encontrada." });
  res.json(serializeExpense(e));
});

router.post("/despesas", async (req, res) => {
  const { description, supplier, category, amount, date, dueDate, paidDate, paymentMethod, account, costCenter, responsible, notes, recurring, recurrenceDay, status, receiptName, receiptMimeType, receiptBase64 } = req.body || {};
  if (!description || !String(description).trim()) return res.status(400).json({ error: "Informe a descrição." });
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: "Informe um valor válido." });
  if (receiptBase64 && receiptBase64.length > MAX_RECEIPT_B64_CHARS) {
    return res.status(400).json({ error: "Arquivo do comprovante muito grande." });
  }

  const created = await prisma.adminExpense.create({
    data: {
      description: String(description).trim(),
      supplier: supplier || null,
      category: category || null,
      amount: value,
      date: toDateOrNull(date),
      dueDate: toDateOrNull(dueDate),
      paidDate: toDateOrNull(paidDate),
      paymentMethod: paymentMethod || null,
      account: account || null,
      costCenter: costCenter || null,
      responsible: responsible || null,
      receiptName: receiptBase64 ? receiptName || null : null,
      receiptMimeType: receiptBase64 ? receiptMimeType || null : null,
      receiptBase64: receiptBase64 || null,
      notes: notes || null,
      recurring: !!recurring,
      recurrenceDay: recurring ? Number(recurrenceDay) || new Date(dueDate || Date.now()).getUTCDate() : null,
      status: status || "PENDENTE",
      createdById: req.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  if (created.recurring) {
    const nextDates = nextRecurrenceDates(created.dueDate, created.recurrenceDay, 2);
    await prisma.adminExpense.createMany({
      data: nextDates.map((d) => ({
        description: created.description,
        supplier: created.supplier,
        category: created.category,
        amount: created.amount,
        dueDate: d,
        paymentMethod: created.paymentMethod,
        account: created.account,
        costCenter: created.costCenter,
        responsible: created.responsible,
        status: "PREVISTO",
        recurring: true,
        recurrenceDay: created.recurrenceDay,
        createdById: req.user.id,
      })),
    });
  }

  res.status(201).json({ ...serializeExpense(created), receiptBase64: null });
});

router.patch("/despesas/:id", async (req, res) => {
  const existing = await prisma.adminExpense.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Despesa não encontrada." });
  const { description, supplier, category, amount, date, dueDate, paidDate, paymentMethod, account, costCenter, responsible, notes, status, receiptName, receiptMimeType, receiptBase64 } = req.body || {};

  const data = {};
  if (description !== undefined) data.description = String(description).trim();
  if (supplier !== undefined) data.supplier = supplier || null;
  if (category !== undefined) data.category = category || null;
  if (amount !== undefined) {
    const value = Number(amount);
    if (!value || value <= 0) return res.status(400).json({ error: "Informe um valor válido." });
    data.amount = value;
  }
  if (date !== undefined) data.date = toDateOrNull(date);
  if (dueDate !== undefined) data.dueDate = toDateOrNull(dueDate);
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;
  if (account !== undefined) data.account = account || null;
  if (costCenter !== undefined) data.costCenter = costCenter || null;
  if (responsible !== undefined) data.responsible = responsible || null;
  if (notes !== undefined) data.notes = notes || null;
  if (receiptBase64 !== undefined) {
    if (receiptBase64 && receiptBase64.length > MAX_RECEIPT_B64_CHARS) return res.status(400).json({ error: "Arquivo do comprovante muito grande." });
    data.receiptBase64 = receiptBase64 || null;
    data.receiptName = receiptBase64 ? receiptName || null : null;
    data.receiptMimeType = receiptBase64 ? receiptMimeType || null : null;
  }
  if (status !== undefined) {
    data.status = status;
    if (status === "PAGO") data.paidDate = toDateOrNull(paidDate) || new Date();
  }
  if (paidDate !== undefined && status === undefined) data.paidDate = toDateOrNull(paidDate);

  const updated = await prisma.adminExpense.update({ where: { id: req.params.id }, data, include: { createdBy: { select: { id: true, name: true } } } });
  res.json({ ...serializeExpense(updated), receiptBase64: null });
});

router.delete("/despesas/:id", async (req, res) => {
  const existing = await prisma.adminExpense.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Despesa não encontrada." });
  const updated = await prisma.adminExpense.update({ where: { id: req.params.id }, data: { status: "CANCELADO" }, include: { createdBy: { select: { id: true, name: true } } } });
  res.json({ ...serializeExpense(updated), receiptBase64: null });
});

// ---------------------------------------------------------------------
// CLIENTES FINANCEIROS
// ---------------------------------------------------------------------

router.get("/clientes-financeiros", async (req, res) => {
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, status: true, plan: true, monthlyValue: true },
    orderBy: { name: "asc" },
  });
  const revenues = await prisma.adminRevenue.findMany({ select: { clientId: true, amount: true, status: true, dueDate: true, paidDate: true } });

  const byClient = new Map();
  for (const r of revenues) {
    if (!r.clientId) continue;
    if (!byClient.has(r.clientId)) byClient.set(r.clientId, []);
    byClient.get(r.clientId).push(r);
  }

  const rows = clients.map((c) => {
    const entries = (byClient.get(c.id) || []).map((r) => ({ ...r, effective: deriveStatus(r.status, r.dueDate) }));
    const totalPago = entries.filter((r) => r.effective === "PAGO").reduce((s, r) => s + r.amount, 0);
    const totalPendente = entries.filter((r) => r.effective === "PENDENTE" || r.effective === "PREVISTO").reduce((s, r) => s + r.amount, 0);
    const totalAtrasado = entries.filter((r) => r.effective === "ATRASADO").reduce((s, r) => s + r.amount, 0);
    const pagos = entries.filter((r) => r.effective === "PAGO" && r.paidDate).sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate));
    const pendentesFuturos = entries.filter((r) => (r.effective === "PENDENTE" || r.effective === "PREVISTO") && r.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    let statusFinanceiro = "SEM_LANCAMENTO";
    if (totalAtrasado > 0) statusFinanceiro = "ATRASADO";
    else if (totalPendente > 0) statusFinanceiro = "PENDENTE";
    else if (totalPago > 0) statusFinanceiro = "EM_DIA";

    return {
      id: c.id,
      name: c.name,
      status: c.status,
      plano: c.plan,
      mensalidade: c.monthlyValue,
      totalPago,
      totalPendente,
      totalAtrasado,
      ultimoPagamento: pagos[0]?.paidDate || null,
      proximoVencimento: pendentesFuturos[0]?.dueDate || null,
      statusFinanceiro,
      lancamentos: entries.length,
    };
  });

  res.json(rows);
});

router.get("/clientes-financeiros/:clientId", async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.clientId }, select: { id: true, name: true, status: true, plan: true, monthlyValue: true } });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  const rows = await prisma.adminRevenue.findMany({
    where: { clientId: req.params.clientId },
    include: { createdBy: { select: { id: true, name: true } }, collectionNotes: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const list = rows.map(serializeRevenue);
  res.json({ client, historico: list });
});

// ---------------------------------------------------------------------
// COBRANÇAS
// ---------------------------------------------------------------------

router.get("/cobrancas", async (req, res) => {
  const rows = await prisma.adminRevenue.findMany({
    where: { status: { in: ["PENDENTE", "ATRASADO"] } },
    include: { client: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, collectionNotes: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } } },
    orderBy: { dueDate: "asc" },
  });
  const today = todayUTC();
  const list = rows
    .map(serializeRevenue)
    .filter((r) => r.status === "PENDENTE" || r.status === "ATRASADO")
    .map((r) => {
      const dias = r.dueDate ? Math.round((startOfDay(r.dueDate) - today) / 86400000) : null;
      return {
        ...r,
        diasParaVencer: dias !== null && dias >= 0 ? dias : null,
        diasAtraso: dias !== null && dias < 0 ? Math.abs(dias) : null,
      };
    })
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate) : 0) - (b.dueDate ? new Date(b.dueDate) : 0));
  res.json(list);
});

router.post("/cobrancas/:id/notas", async (req, res) => {
  const existing = await prisma.adminRevenue.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  const { type, note } = req.body || {};
  if (!note || !String(note).trim()) return res.status(400).json({ error: "Escreva uma observação." });
  const created = await prisma.adminCollectionNote.create({
    data: { revenueId: req.params.id, type: type || "OUTRO", note: String(note).trim(), createdById: req.user.id },
    include: { createdBy: { select: { name: true } } },
  });
  res.status(201).json({ id: created.id, type: created.type, note: created.note, createdAt: created.createdAt, createdBy: created.createdBy?.name || null });
});

// ---------------------------------------------------------------------
// FLUXO DE CAIXA
// ---------------------------------------------------------------------

router.get("/fluxo-caixa", async (req, res) => {
  const [revenues, expenses] = await Promise.all([
    prisma.adminRevenue.findMany({ select: { amount: true, status: true, dueDate: true, paidDate: true } }),
    prisma.adminExpense.findMany({ select: { amount: true, status: true, dueDate: true, paidDate: true } }),
  ]);

  const withEffective = (rows) => rows.map((r) => ({ ...r, effective: deriveStatus(r.status, r.dueDate) }));
  const rev = withEffective(revenues);
  const exp = withEffective(expenses);

  const saldoAtual =
    rev.filter((r) => r.effective === "PAGO").reduce((s, r) => s + r.amount, 0) -
    exp.filter((e) => e.effective === "PAGO").reduce((s, e) => s + e.amount, 0);

  // Série mensal — últimos 12 meses (realizado) a partir de hoje.
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }
  const inMonth = (date, m) => date && new Date(date).getUTCFullYear() === m.year && new Date(date).getUTCMonth() === m.month;

  const serie = months.map((m) => {
    const entradasRealizado = rev.filter((r) => r.effective === "PAGO" && inMonth(r.paidDate, m)).reduce((s, r) => s + r.amount, 0);
    const saidasRealizado = exp.filter((e) => e.effective === "PAGO" && inMonth(e.paidDate, m)).reduce((s, e) => s + e.amount, 0);
    const entradasPrevisto = rev.filter((r) => (r.effective === "PENDENTE" || r.effective === "PREVISTO" || r.effective === "ATRASADO") && inMonth(r.dueDate, m)).reduce((s, r) => s + r.amount, 0);
    const saidasPrevisto = exp.filter((e) => (e.effective === "PENDENTE" || e.effective === "PREVISTO" || e.effective === "ATRASADO") && inMonth(e.dueDate, m)).reduce((s, e) => s + e.amount, 0);
    return {
      mes: m.key,
      entradasRealizado,
      saidasRealizado,
      saldoRealizado: entradasRealizado - saidasRealizado,
      entradasPrevisto,
      saidasPrevisto,
    };
  });

  // Projeção de saldo pra frente, a partir de tudo que ainda não foi pago
  // mas já tem vencimento previsto dentro do horizonte.
  const horizontes = [30, 60, 90, 180, 365];
  const projecoes = horizontes.map((dias) => {
    const limite = new Date(now.getTime() + dias * 86400000);
    const entradas = rev
      .filter((r) => r.effective !== "PAGO" && r.effective !== "CANCELADO" && r.dueDate && new Date(r.dueDate) <= limite)
      .reduce((s, r) => s + r.amount, 0);
    const saidas = exp
      .filter((e) => e.effective !== "PAGO" && e.effective !== "CANCELADO" && e.dueDate && new Date(e.dueDate) <= limite)
      .reduce((s, e) => s + e.amount, 0);
    return { dias, entradasPrevistas: entradas, saidasPrevistas: saidas, saldoProjetado: saldoAtual + entradas - saidas };
  });

  res.json({ saldoAtual, serie, projecoes });
});

// ---------------------------------------------------------------------
// DASHBOARD ADMINISTRATIVO
// ---------------------------------------------------------------------

const PRESET_MONTHS = { mes: 1, trimestre: 3, semestre: 6, ano: 12 };

function periodRange(preset, from, to) {
  const now = new Date();
  if (preset === "personalizado" && from && to) {
    return { start: startOfDay(from), end: startOfDay(to) };
  }
  const months = PRESET_MONTHS[preset] || 1;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end };
}

function previousRange(start, end) {
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start: startOfDay(prevStart), end: startOfDay(prevEnd) };
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

router.get("/dashboard", async (req, res) => {
  const { preset = "mes", from, to } = req.query;
  const { start, end } = periodRange(preset, from, to);
  const prev = previousRange(start, end);

  const [revenues, expenses, clientesAtivos] = await Promise.all([
    prisma.adminRevenue.findMany({ select: { amount: true, status: true, dueDate: true, paidDate: true, clientId: true } }),
    prisma.adminExpense.findMany({ select: { amount: true, status: true, dueDate: true, paidDate: true } }),
    prisma.client.count({ where: { status: "ATIVO" } }),
  ]);

  const rev = revenues.map((r) => ({ ...r, effective: deriveStatus(r.status, r.dueDate) }));
  const exp = expenses.map((e) => ({ ...e, effective: deriveStatus(e.status, e.dueDate) }));

  const inRange = (date, s, e) => date && new Date(date) >= s && new Date(date) <= e;

  function summarize(s, e) {
    const receitaRecebida = rev.filter((r) => r.effective === "PAGO" && inRange(r.paidDate, s, e)).reduce((sum, r) => sum + r.amount, 0);
    const receitaAReceber = rev.filter((r) => (r.effective === "PENDENTE" || r.effective === "PREVISTO" || r.effective === "ATRASADO") && inRange(r.dueDate, s, e)).reduce((sum, r) => sum + r.amount, 0);
    const despesasPagas = exp.filter((x) => x.effective === "PAGO" && inRange(x.paidDate, s, e)).reduce((sum, x) => sum + x.amount, 0);
    const despesasAPagar = exp.filter((x) => (x.effective === "PENDENTE" || x.effective === "PREVISTO" || x.effective === "ATRASADO") && inRange(x.dueDate, s, e)).reduce((sum, x) => sum + x.amount, 0);
    const lucro = receitaRecebida - despesasPagas;
    const margem = receitaRecebida > 0 ? Math.round((lucro / receitaRecebida) * 1000) / 10 : null;
    return { receitaRecebida, receitaAReceber, despesasPagas, despesasAPagar, lucro, margem };
  }

  const atual = summarize(start, end);
  const anterior = summarize(prev.start, prev.end);

  // Inadimplência é sempre uma foto de agora (quem está devendo hoje), não
  // recortada pelo período selecionado no filtro.
  const atrasados = rev.filter((r) => r.effective === "ATRASADO");
  const clientesInadimplentes = new Set(atrasados.filter((r) => r.clientId).map((r) => r.clientId));
  const inadimplenciaValor = atrasados.reduce((sum, r) => sum + r.amount, 0);

  // Série dos últimos 6 meses (receita paga x despesa paga) — usada nos
  // gráficos "Receita mensal / Despesas mensais / Receita x despesa".
  const now = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
  const graficoMensal = meses.map((m) => {
    const mEnd = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    const receita = rev.filter((r) => r.effective === "PAGO" && inRange(r.paidDate, m, mEnd)).reduce((s, r) => s + r.amount, 0);
    const despesa = exp.filter((x) => x.effective === "PAGO" && inRange(x.paidDate, m, mEnd)).reduce((s, x) => s + x.amount, 0);
    return { mes: `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`, receita, despesa, lucro: receita - despesa };
  });

  res.json({
    periodo: { preset, start, end },
    atual,
    anterior,
    variacao: {
      receitaRecebida: pctChange(atual.receitaRecebida, anterior.receitaRecebida),
      despesasPagas: pctChange(atual.despesasPagas, anterior.despesasPagas),
      lucro: pctChange(atual.lucro, anterior.lucro),
    },
    inadimplencia: { clientes: clientesInadimplentes.size, valor: inadimplenciaValor, quantidade: atrasados.length },
    clientesAtivos,
    graficoMensal,
  });
});

// ==========================================================================
// FASE 2 (07/09/2026): DRE, Impostos, Contratos, Equipe, Folha de
// pagamentos, Comissões (visão consolidada) e Ferramentas/Fornecedores.
// ==========================================================================

// Teto de arquivo genérico (contrato anexado) — mesmo valor já usado pro
// comprovante de despesa.
const MAX_FILE_B64_CHARS = MAX_RECEIPT_B64_CHARS;

// ---------------------------------------------------------------------
// DRE (demonstração de resultado gerencial)
// ---------------------------------------------------------------------

router.get("/dre", async (req, res) => {
  const { preset = "mes", from, to } = req.query;
  const { start, end } = periodRange(preset, from, to);

  const [revenues, expenses] = await Promise.all([
    prisma.adminRevenue.findMany({ where: { status: "PAGO" }, select: { amount: true, category: true, paidDate: true } }),
    prisma.adminExpense.findMany({ where: { status: "PAGO" }, select: { amount: true, category: true, paidDate: true } }),
  ]);

  const inRange = (d) => d && new Date(d) >= start && new Date(d) <= end;
  const rev = revenues.filter((r) => inRange(r.paidDate));
  const exp = expenses.filter((e) => inRange(e.paidDate));

  const receitaPorCategoria = {};
  for (const r of rev) {
    const cat = r.category || "Outras receitas";
    receitaPorCategoria[cat] = (receitaPorCategoria[cat] || 0) + r.amount;
  }
  const despesaPorCategoria = {};
  for (const e of exp) {
    const cat = e.category || "Outras despesas";
    despesaPorCategoria[cat] = (despesaPorCategoria[cat] || 0) + e.amount;
  }
  const toList = (obj) => Object.entries(obj).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);

  const receitaBruta = rev.reduce((s, r) => s + r.amount, 0);
  const totalDespesas = exp.reduce((s, e) => s + e.amount, 0);
  const resultadoLiquido = receitaBruta - totalDespesas;
  const margem = receitaBruta > 0 ? Math.round((resultadoLiquido / receitaBruta) * 1000) / 10 : null;

  res.json({
    periodo: { preset, start, end },
    receitaBruta,
    receitaPorCategoria: toList(receitaPorCategoria),
    totalDespesas,
    despesaPorCategoria: toList(despesaPorCategoria),
    resultadoLiquido,
    margem,
  });
});

// ---------------------------------------------------------------------
// IMPOSTOS — reaproveita AdminExpense (categoria "Impostos"); criar/editar/
// marcar pago/cancelar continua pelos endpoints de /despesas já existentes.
// Esse endpoint só monta a visão com alerta de vencimento (3/7/15/30 dias).
// ---------------------------------------------------------------------

router.get("/impostos", async (req, res) => {
  const rows = await prisma.adminExpense.findMany({
    where: { category: "Impostos" },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  const today = todayUTC();
  const list = rows.map(serializeExpense).map((e) => {
    const dias = e.dueDate ? Math.round((startOfDay(e.dueDate) - today) / 86400000) : null;
    return {
      ...e,
      receiptBase64: null,
      diasParaVencer: dias !== null && dias >= 0 ? dias : null,
      diasAtraso: dias !== null && dias < 0 ? Math.abs(dias) : null,
    };
  });
  res.json(list);
});

// ---------------------------------------------------------------------
// CONTRATOS (cliente, funcionário/prestador, fornecedor)
// ---------------------------------------------------------------------

const CONTRACT_TYPES = ["CLIENTE", "FUNCIONARIO", "PRESTADOR", "FORNECEDOR"];

function serializeContract(c) {
  const today = todayUTC();
  let diasParaVencer = null;
  let diasAtraso = null;
  if (c.endDate) {
    const dias = Math.round((startOfDay(c.endDate) - today) / 86400000);
    if (dias >= 0) diasParaVencer = dias;
    else diasAtraso = Math.abs(dias);
  }
  const alertaRenovacao = c.status === "ATIVO" && diasParaVencer !== null && diasParaVencer <= (c.renewalAlertDays || 30);
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    counterpartyName: c.counterpartyName,
    startDate: c.startDate,
    endDate: c.endDate,
    value: c.value,
    renewalAlertDays: c.renewalAlertDays,
    status: c.status,
    fileName: c.fileName,
    fileMimeType: c.fileMimeType,
    hasFile: !!c.fileBase64,
    fileBase64: c.fileBase64 || null,
    notes: c.notes,
    createdAt: c.createdAt,
    client: c.client ? { id: c.client.id, name: c.client.name } : null,
    employee: c.employee ? { id: c.employee.id, name: c.employee.name } : null,
    supplier: c.supplier ? { id: c.supplier.id, name: c.supplier.name } : null,
    createdBy: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
    diasParaVencer,
    diasAtraso,
    alertaRenovacao,
  };
}

const CONTRACT_INCLUDE = {
  client: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

router.get("/contratos", async (req, res) => {
  const { type, status, q } = req.query;
  const where = {};
  if (type && CONTRACT_TYPES.includes(type)) where.type = type;
  if (status) where.status = status;
  if (q) where.title = { contains: String(q), mode: "insensitive" };
  const rows = await prisma.adminContract.findMany({ where, include: CONTRACT_INCLUDE, orderBy: [{ endDate: "asc" }, { createdAt: "desc" }] });
  res.json(rows.map((c) => ({ ...serializeContract(c), fileBase64: null })));
});

router.post("/contratos", async (req, res) => {
  const { type, title, counterpartyName, clientId, employeeId, supplierId, startDate, endDate, value, renewalAlertDays, notes, fileName, fileMimeType, fileBase64 } = req.body || {};
  if (!type || !CONTRACT_TYPES.includes(type)) return res.status(400).json({ error: "Informe o tipo do contrato." });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Informe o título do contrato." });
  if (fileBase64 && fileBase64.length > MAX_FILE_B64_CHARS) return res.status(400).json({ error: "Arquivo muito grande." });
  if (clientId) {
    const found = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!found) return res.status(400).json({ error: "Cliente não encontrado." });
  }
  if (employeeId) {
    const found = await prisma.adminEmployee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!found) return res.status(400).json({ error: "Membro da equipe não encontrado." });
  }
  if (supplierId) {
    const found = await prisma.adminSupplier.findUnique({ where: { id: supplierId }, select: { id: true } });
    if (!found) return res.status(400).json({ error: "Fornecedor não encontrado." });
  }

  const created = await prisma.adminContract.create({
    data: {
      type,
      title: String(title).trim(),
      counterpartyName: counterpartyName || null,
      clientId: clientId || null,
      employeeId: employeeId || null,
      supplierId: supplierId || null,
      startDate: toDateOrNull(startDate),
      endDate: toDateOrNull(endDate),
      value: value != null && value !== "" ? Number(value) : null,
      renewalAlertDays: renewalAlertDays ? Number(renewalAlertDays) : 30,
      notes: notes || null,
      fileName: fileBase64 ? fileName || null : null,
      fileMimeType: fileBase64 ? fileMimeType || null : null,
      fileBase64: fileBase64 || null,
      createdById: req.user.id,
    },
    include: CONTRACT_INCLUDE,
  });
  res.status(201).json({ ...serializeContract(created), fileBase64: null });
});

router.patch("/contratos/:id", async (req, res) => {
  const existing = await prisma.adminContract.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Contrato não encontrado." });
  const { title, counterpartyName, clientId, employeeId, supplierId, startDate, endDate, value, renewalAlertDays, status, notes, fileName, fileMimeType, fileBase64 } = req.body || {};

  const data = {};
  if (title !== undefined) data.title = String(title).trim();
  if (counterpartyName !== undefined) data.counterpartyName = counterpartyName || null;
  if (clientId !== undefined) data.clientId = clientId || null;
  if (employeeId !== undefined) data.employeeId = employeeId || null;
  if (supplierId !== undefined) data.supplierId = supplierId || null;
  if (startDate !== undefined) data.startDate = toDateOrNull(startDate);
  if (endDate !== undefined) data.endDate = toDateOrNull(endDate);
  if (value !== undefined) data.value = value != null && value !== "" ? Number(value) : null;
  if (renewalAlertDays !== undefined) data.renewalAlertDays = Number(renewalAlertDays) || 30;
  if (status !== undefined) data.status = status;
  if (notes !== undefined) data.notes = notes || null;
  if (fileBase64 !== undefined) {
    if (fileBase64 && fileBase64.length > MAX_FILE_B64_CHARS) return res.status(400).json({ error: "Arquivo muito grande." });
    data.fileBase64 = fileBase64 || null;
    data.fileName = fileBase64 ? fileName || null : null;
    data.fileMimeType = fileBase64 ? fileMimeType || null : null;
  }

  const updated = await prisma.adminContract.update({ where: { id: req.params.id }, data, include: CONTRACT_INCLUDE });
  res.json({ ...serializeContract(updated), fileBase64: null });
});

// Encerrar/cancelar um contrato nunca apaga o registro — só muda o status
// (mesmo princípio já usado em Receitas/Despesas).
router.delete("/contratos/:id", async (req, res) => {
  const existing = await prisma.adminContract.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Contrato não encontrado." });
  const updated = await prisma.adminContract.update({ where: { id: req.params.id }, data: { status: "CANCELADO" }, include: CONTRACT_INCLUDE });
  res.json({ ...serializeContract(updated), fileBase64: null });
});

// ---------------------------------------------------------------------
// EQUIPE
// ---------------------------------------------------------------------

function serializeEmployee(e) {
  return {
    id: e.id,
    name: e.name,
    role: e.role,
    type: e.type,
    email: e.email,
    phone: e.phone,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    paymentValue: e.paymentValue,
    paymentDay: e.paymentDay,
    notes: e.notes,
    createdAt: e.createdAt,
    user: e.user ? { id: e.user.id, name: e.user.name, role: e.user.role } : null,
  };
}

router.get("/equipe", async (req, res) => {
  const rows = await prisma.adminEmployee.findMany({ include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { name: "asc" } });
  res.json(rows.map(serializeEmployee));
});

// Logins internos (sócio/gestor/atendente) disponíveis pra vincular a uma
// ficha de equipe — o frontend descarta os que já aparecem vinculados a
// outro membro na própria listagem de /equipe.
router.get("/equipe-usuarios", async (req, res) => {
  const rows = await prisma.user.findMany({
    where: { role: { in: ["SOCIO", "GESTOR", "ATENDENTE"] }, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/equipe", async (req, res) => {
  const { name, role, type, email, phone, startDate, endDate, status, paymentValue, paymentDay, notes, userId } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Informe o nome." });
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) return res.status(400).json({ error: "Usuário não encontrado." });
    const already = await prisma.adminEmployee.findUnique({ where: { userId } });
    if (already) return res.status(400).json({ error: "Esse usuário já tem uma ficha de equipe." });
  }
  const created = await prisma.adminEmployee.create({
    data: {
      name: String(name).trim(),
      role: role || null,
      type: type || "CLT",
      email: email || null,
      phone: phone || null,
      startDate: toDateOrNull(startDate),
      endDate: toDateOrNull(endDate),
      status: status || "ATIVO",
      paymentValue: paymentValue != null && paymentValue !== "" ? Number(paymentValue) : null,
      paymentDay: paymentDay ? Number(paymentDay) : null,
      notes: notes || null,
      userId: userId || null,
    },
    include: { user: { select: { id: true, name: true, role: true } } },
  });
  res.status(201).json(serializeEmployee(created));
});

router.patch("/equipe/:id", async (req, res) => {
  const existing = await prisma.adminEmployee.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Membro da equipe não encontrado." });
  const { name, role, type, email, phone, startDate, endDate, status, paymentValue, paymentDay, notes, userId } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (role !== undefined) data.role = role || null;
  if (type !== undefined) data.type = type;
  if (email !== undefined) data.email = email || null;
  if (phone !== undefined) data.phone = phone || null;
  if (startDate !== undefined) data.startDate = toDateOrNull(startDate);
  if (endDate !== undefined) data.endDate = toDateOrNull(endDate);
  if (status !== undefined) data.status = status;
  if (paymentValue !== undefined) data.paymentValue = paymentValue != null && paymentValue !== "" ? Number(paymentValue) : null;
  if (paymentDay !== undefined) data.paymentDay = paymentDay ? Number(paymentDay) : null;
  if (notes !== undefined) data.notes = notes || null;
  if (userId !== undefined) data.userId = userId || null;
  const updated = await prisma.adminEmployee.update({ where: { id: req.params.id }, data, include: { user: { select: { id: true, name: true, role: true } } } });
  res.json(serializeEmployee(updated));
});

// Sem exclusão permanente — desligar marca status DESLIGADO, preservando o
// histórico de pagamentos/contratos ligados a essa pessoa.
router.delete("/equipe/:id", async (req, res) => {
  const existing = await prisma.adminEmployee.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Membro da equipe não encontrado." });
  const updated = await prisma.adminEmployee.update({ where: { id: req.params.id }, data: { status: "DESLIGADO" }, include: { user: { select: { id: true, name: true, role: true } } } });
  res.json(serializeEmployee(updated));
});

// ---------------------------------------------------------------------
// FOLHA DE PAGAMENTOS — reaproveita AdminExpense (via employeeId) em vez de
// um livro-caixa paralelo; "lançar" cria a despesa do mês pra essa pessoa.
// ---------------------------------------------------------------------

function monthRange(monthStr) {
  let year;
  let month;
  if (monthStr && /^\d{4}-\d{2}$/.test(String(monthStr))) {
    [year, month] = String(monthStr).split("-").map(Number);
    month -= 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
  }
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { start, end, key };
}

router.get("/folha", async (req, res) => {
  const { month } = req.query;
  const { start, end, key } = monthRange(month);
  const employees = await prisma.adminEmployee.findMany({ where: { status: "ATIVO" }, orderBy: { name: "asc" } });
  const expenses = employees.length
    ? await prisma.adminExpense.findMany({
        where: { employeeId: { in: employees.map((e) => e.id) }, OR: [{ dueDate: { gte: start, lte: end } }, { date: { gte: start, lte: end } }] },
      })
    : [];
  const byEmployee = new Map();
  for (const e of expenses) if (e.employeeId) byEmployee.set(e.employeeId, e);

  const rows = employees.map((e) => {
    const lanc = byEmployee.get(e.id);
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      type: e.type,
      paymentValue: e.paymentValue,
      paymentDay: e.paymentDay,
      lancamento: lanc
        ? { id: lanc.id, status: deriveStatus(lanc.status, lanc.dueDate), amount: lanc.amount, dueDate: lanc.dueDate, paidDate: lanc.paidDate }
        : null,
    };
  });
  res.json({ month: key, rows });
});

router.post("/folha/:employeeId/lancar", async (req, res) => {
  const employee = await prisma.adminEmployee.findUnique({ where: { id: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: "Membro da equipe não encontrado." });
  const { month, amount } = req.body || {};
  const effectiveAmount = amount != null && amount !== "" ? Number(amount) : employee.paymentValue;
  if (!effectiveAmount || effectiveAmount <= 0) return res.status(400).json({ error: "Defina um valor de pagamento válido pra essa pessoa." });

  const { start, end, key } = monthRange(month);
  const already = await prisma.adminExpense.findFirst({ where: { employeeId: employee.id, OR: [{ dueDate: { gte: start, lte: end } }, { date: { gte: start, lte: end } }] } });
  if (already) return res.status(400).json({ error: `O pagamento de ${key} já foi lançado pra ${employee.name}.` });

  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(employee.paymentDay || 5, lastDay);
  const dueDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));

  const created = await prisma.adminExpense.create({
    data: {
      description: `Pagamento — ${employee.name} (${key})`,
      category: employee.type === "PJ" || employee.type === "PRESTADOR" ? "Prestadores" : "Funcionários",
      amount: effectiveAmount,
      dueDate,
      responsible: employee.name,
      status: "PENDENTE",
      employeeId: employee.id,
      createdById: req.user.id,
    },
  });
  res.status(201).json({ ...serializeExpense(created), receiptBase64: null });
});

// ---------------------------------------------------------------------
// COMISSÕES — visão consolidada por gestor, a partir do Commission/
// WithdrawalRequest que já existiam pro financeiro do gestor (aba
// Financeiro). Não é um livro novo — só reúne aqui pra o sócio-contador
// ver junto do resto da Administração. Preparado pra, no futuro, somar
// também comissão de SDR/Closer quando esses papéis existirem.
// ---------------------------------------------------------------------

router.get("/comissoes", async (req, res) => {
  const [pessoas, commissions, withdrawals] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["SOCIO", "GESTOR"] } }, select: { id: true, name: true, rank: true, role: true } }),
    prisma.commission.findMany({ select: { gestorId: true, amount: true, service: true } }),
    prisma.withdrawalRequest.findMany({ where: { status: "APROVADA" }, select: { gestorId: true, amount: true } }),
  ]);

  const rows = pessoas
    .map((p) => {
      const gComm = commissions.filter((c) => c.gestorId === p.id);
      const totalGerado = gComm.reduce((s, c) => s + c.amount, 0);
      const totalSacado = withdrawals.filter((w) => w.gestorId === p.id).reduce((s, w) => s + w.amount, 0);
      return { id: p.id, name: p.name, role: p.role, rank: p.rank, totalGerado, totalSacado, saldo: totalGerado - totalSacado, servicosAceitos: gComm.length };
    })
    .filter((r) => r.totalGerado > 0 || r.totalSacado > 0)
    .sort((a, b) => b.totalGerado - a.totalGerado);

  res.json(rows);
});

// ---------------------------------------------------------------------
// FERRAMENTAS E ASSINATURAS
// ---------------------------------------------------------------------

function serializeTool(t) {
  const today = todayUTC();
  let diasParaVencer = null;
  let diasAtraso = null;
  if (t.renewalDate) {
    const dias = Math.round((startOfDay(t.renewalDate) - today) / 86400000);
    if (dias >= 0) diasParaVencer = dias;
    else diasAtraso = Math.abs(dias);
  }
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    monthlyValue: t.monthlyValue,
    renewalDate: t.renewalDate,
    status: t.status,
    responsible: t.responsible,
    url: t.url,
    notes: t.notes,
    createdAt: t.createdAt,
    diasParaVencer,
    diasAtraso,
  };
}

router.get("/ferramentas", async (req, res) => {
  const rows = await prisma.adminTool.findMany({ orderBy: [{ renewalDate: "asc" }, { name: "asc" }] });
  res.json(rows.map(serializeTool));
});

router.post("/ferramentas", async (req, res) => {
  const { name, category, monthlyValue, renewalDate, status, responsible, url, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Informe o nome da ferramenta." });
  const created = await prisma.adminTool.create({
    data: {
      name: String(name).trim(),
      category: category || null,
      monthlyValue: monthlyValue != null && monthlyValue !== "" ? Number(monthlyValue) : null,
      renewalDate: toDateOrNull(renewalDate),
      status: status || "ATIVO",
      responsible: responsible || null,
      url: url || null,
      notes: notes || null,
    },
  });
  res.status(201).json(serializeTool(created));
});

router.patch("/ferramentas/:id", async (req, res) => {
  const existing = await prisma.adminTool.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Ferramenta não encontrada." });
  const { name, category, monthlyValue, renewalDate, status, responsible, url, notes } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (category !== undefined) data.category = category || null;
  if (monthlyValue !== undefined) data.monthlyValue = monthlyValue != null && monthlyValue !== "" ? Number(monthlyValue) : null;
  if (renewalDate !== undefined) data.renewalDate = toDateOrNull(renewalDate);
  if (status !== undefined) data.status = status;
  if (responsible !== undefined) data.responsible = responsible || null;
  if (url !== undefined) data.url = url || null;
  if (notes !== undefined) data.notes = notes || null;
  const updated = await prisma.adminTool.update({ where: { id: req.params.id }, data });
  res.json(serializeTool(updated));
});

router.delete("/ferramentas/:id", async (req, res) => {
  const existing = await prisma.adminTool.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Ferramenta não encontrada." });
  const updated = await prisma.adminTool.update({ where: { id: req.params.id }, data: { status: "CANCELADO" } });
  res.json(serializeTool(updated));
});

// ---------------------------------------------------------------------
// FORNECEDORES
// ---------------------------------------------------------------------

router.get("/fornecedores", async (req, res) => {
  const rows = await prisma.adminSupplier.findMany({ orderBy: { name: "asc" } });
  const expenses = await prisma.adminExpense.findMany({ where: { status: { not: "CANCELADO" }, NOT: { supplier: null } }, select: { supplier: true, amount: true } });
  const spendByName = new Map();
  for (const e of expenses) {
    const key = (e.supplier || "").trim().toLowerCase();
    if (!key) continue;
    spendByName.set(key, (spendByName.get(key) || 0) + e.amount);
  }
  const list = rows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    contact: s.contact,
    notes: s.notes,
    status: s.status,
    createdAt: s.createdAt,
    // Estimado casando o nome do fornecedor com o campo de texto livre
    // `supplier` já usado em Despesas — não há chave estrangeira entre os
    // dois por enquanto (ver comentário no schema.prisma).
    totalGasto: spendByName.get(s.name.trim().toLowerCase()) || 0,
  }));
  res.json(list);
});

router.post("/fornecedores", async (req, res) => {
  const { name, category, contact, notes, status } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Informe o nome do fornecedor." });
  const created = await prisma.adminSupplier.create({
    data: { name: String(name).trim(), category: category || null, contact: contact || null, notes: notes || null, status: status || "ATIVO" },
  });
  res.status(201).json({ ...created, totalGasto: 0 });
});

router.patch("/fornecedores/:id", async (req, res) => {
  const existing = await prisma.adminSupplier.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Fornecedor não encontrado." });
  const { name, category, contact, notes, status } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (category !== undefined) data.category = category || null;
  if (contact !== undefined) data.contact = contact || null;
  if (notes !== undefined) data.notes = notes || null;
  if (status !== undefined) data.status = status;
  const updated = await prisma.adminSupplier.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

router.delete("/fornecedores/:id", async (req, res) => {
  const existing = await prisma.adminSupplier.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Fornecedor não encontrado." });
  const updated = await prisma.adminSupplier.update({ where: { id: req.params.id }, data: { status: "INATIVO" } });
  res.json(updated);
});

module.exports = router;
