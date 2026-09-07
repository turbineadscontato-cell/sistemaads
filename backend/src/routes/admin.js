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

module.exports = router;
