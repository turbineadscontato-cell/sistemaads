const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { nextOccurrence, advanceAfterOptimizing } = require("../utils/optimizationSchedule");
const { addBusinessDays } = require("../utils/businessDays");
const { SERVICE_OPTIONS, SERVICE_LABEL, COMMISSION_PER_SERVICE } = require("../utils/services");
const { onlyDigits } = require("../utils/identifier");

const VALID_SERVICE_KEYS = SERVICE_OPTIONS.map((s) => s.key);
function sanitizeServices(services) {
  if (!Array.isArray(services)) return [];
  return services.filter((s) => VALID_SERVICE_KEYS.includes(s));
}

// Checklist padrão de onboarding — criado automaticamente pra todo cliente
// novo no plano COMPLETO (tráfego pago), com prazo em dias úteis contados a
// partir da data de contratação (criação do cliente no sistema).
const ONBOARDING_TASKS = [
  { title: "Configuração de conta de anúncio (Meta/Google)", businessDays: 1, priority: "ALTA" },
  { title: "Criação de criativo", businessDays: 2, priority: "ALTA" },
  { title: "Criação do site/landing page", businessDays: 3, priority: "MEDIA" },
  { title: "Reunião no WhatsApp (verba, público, interesses, lista de clientes)", businessDays: 4, priority: "MEDIA" },
  { title: "Subir campanha", businessDays: 7, priority: "ALTA" },
  { title: "Primeira otimização de campanha", businessDays: 14, priority: "MEDIA" },
];

const router = express.Router();
router.use(requireAuth);

// SOCIO sees every client. GESTOR sees only clients assigned to them.
// ATENDENTE has no access to the closed client portfolio (their tools live under /leads).
function scopeFilter(user) {
  if (user.role === "SOCIO") return {};
  if (user.role === "GESTOR") return { gestorId: user.id };
  if (user.role === "CLIENTE") return { id: user.clientId || "__none__" };
  return { id: "__none__" }; // ATENDENTE: matches nothing
}

router.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: scopeFilter(req.user),
    include: {
      gestor: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" }, take: 1 },
      pendencies: { where: { status: "ABERTA" }, select: { id: true } },
      // Surfaced in the "quick info" panel (client/task click) so a gestor
      // doesn't need to open Campanhas just to see which conta de anúncio a
      // client is mapped to before working on something like an otimização.
      adAccounts: { select: { id: true, name: true, accountStatus: true } },
    },
    orderBy: { name: "asc" },
  });
  // Shape the response so the frontend gets a simple count without depending
  // on Prisma's filtered-relation-count feature (version-sensitive).
  const withCounts = clients.map(({ pendencies, ...c }) => ({ ...c, openPendencies: pendencies.length }));
  res.json(withCounts);
});

// Curated, read-only view for the client portal — no internal notes, no
// internal task list, just what the client is meant to see about themselves.
router.get("/me/portal", requireRole("CLIENTE"), async (req, res) => {
  if (!req.user.clientId) return res.status(404).json({ error: "Login não vinculado a um cliente." });
  const client = await prisma.client.findUnique({
    where: { id: req.user.clientId },
    include: {
      gestor: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" } },
    },
  });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  const { notes, ...safe } = client;
  res.json(safe);
});

router.get("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, ...scopeFilter(req.user) },
    include: {
      gestor: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" } },
      tasks: { orderBy: { dueDate: "asc" } },
      pendencies: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  res.json(client);
});

// Sócio cadastra cliente novo (conta pro financeiro/MRR do painel, ganha
// checklist de onboarding automático). Gestor também pode cadastrar — mas só
// pra registrar cliente antigo na própria carteira (aba "Meus clientes"):
// fica preso ao próprio gestorId, não soma no financeiro do painel e não
// ganha o checklist de onboarding (não é uma contratação nova).
router.post("/", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const isSocio = req.user.role === "SOCIO";
  const { name, niche, status, plan, monthlyValue, dailyAdBudget, startDate, gestorId, notes, optimizationDay, activeCreative, planType, services, otherServiceNote } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome do cliente é obrigatório." });

  const optDay = optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null;
  const cleanServices = sanitizeServices(services);
  const client = await prisma.client.create({
    data: {
      name,
      niche,
      status: status || "ONBOARDING",
      plan,
      monthlyValue: monthlyValue != null ? Number(monthlyValue) : null,
      dailyAdBudget: dailyAdBudget != null ? Number(dailyAdBudget) : null,
      startDate: startDate ? new Date(startDate) : null,
      // Gestor só cadastra pra própria carteira — ignora qualquer gestorId
      // que venha no corpo da requisição.
      gestorId: isSocio ? (gestorId || null) : req.user.id,
      notes: notes || null,
      optimizationDay: optDay,
      // Seed the first "próxima otimização" right away so the alert/board
      // has something concrete to show from day one, instead of waiting for
      // someone to mark one as feita first.
      nextOptimizationDate: optDay != null ? nextOccurrence(optDay, new Date()) : null,
      activeCreative: activeCreative || null,
      planType: planType === "SO_SISTEMA" ? "SO_SISTEMA" : "COMPLETO",
      services: cleanServices,
      otherServiceNote: cleanServices.includes("OUTRO") ? (otherServiceNote || null) : null,
      // Só o que o sócio cadastra entra no MRR/financeiro do painel — cliente
      // antigo que o gestor está só catalogando não deve inflar esses números.
      countsInFinance: isSocio,
    },
  });

  // Checklist automático de onboarding — só pra contratação nova feita pelo
  // sócio, e só quem contratou tráfego pago (conta de anúncio, criativo,
  // campanha...). Cliente antigo cadastrado pelo gestor, ou cliente só
  // sistema, não ganham esses passos.
  if (isSocio && client.planType !== "SO_SISTEMA") {
    const createdAt = client.createdAt;
    await prisma.task.createMany({
      data: ONBOARDING_TASKS.map((t) => ({
        title: t.title,
        priority: t.priority,
        dueDate: addBusinessDays(createdAt, t.businessDays),
        clientId: client.id,
        gestorId: client.gestorId || null,
      })),
    });
  }

  res.status(201).json(client);
});

// Sócio "dá o aceite" dos serviços contratados pelo cliente — lança uma
// comissão de R$50 por serviço pro gestor responsável. Só pode ser feito uma
// vez por cliente (servicesAcceptedAt marca isso); pra mudar os serviços
// depois disso, seria um novo aceite manual — mantido simples de propósito.
router.post("/:id/accept-services", requireRole("SOCIO"), async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  if (client.servicesAcceptedAt) {
    return res.status(400).json({ error: "Os serviços desse cliente já foram aceitos." });
  }
  if (!client.gestorId) {
    return res.status(400).json({ error: "Defina um gestor responsável antes de dar o aceite." });
  }
  if (!client.services || client.services.length === 0) {
    return res.status(400).json({ error: "Esse cliente não tem nenhum serviço marcado." });
  }

  await prisma.$transaction([
    prisma.commission.createMany({
      data: client.services.map((key) => ({
        amount: COMMISSION_PER_SERVICE,
        service: key === "OUTRO" && client.otherServiceNote ? `Outro (${client.otherServiceNote})` : (SERVICE_LABEL[key] || key),
        gestorId: client.gestorId,
        clientId: client.id,
      })),
    }),
    prisma.client.update({ where: { id: client.id }, data: { servicesAcceptedAt: new Date() } }),
  ]);

  const totalAdded = client.services.length * COMMISSION_PER_SERVICE;
  res.json({ ok: true, totalAdded });
});

// Sócio (qualquer cliente) ou gestor (só cliente da própria carteira) cria
// ou reseta o login do portal do cliente — com email, CPF ou telefone como
// identificador (pelo menos um dos três é obrigatório).
router.post("/:id/portal-login", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.id, ...scopeFilter(req.user) } });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });

  const { name, email, cpf, phone, password } = req.body || {};
  const cleanEmail = email ? email.toLowerCase().trim() : null;
  const cleanCpf = cpf ? onlyDigits(cpf) : null;
  const cleanPhone = phone ? onlyDigits(phone) : null;
  if (!cleanEmail && !cleanCpf && !cleanPhone) {
    return res.status(400).json({ error: "Informe email, CPF ou telefone pra criar o login." });
  }
  if (!password) return res.status(400).json({ error: "Defina uma senha." });

  try {
    const existing = await prisma.user.findFirst({ where: { clientId: client.id, role: "CLIENTE" } });
    const passwordHash = await bcrypt.hash(password, 10);
    const data = {
      name: name || client.name,
      email: cleanEmail,
      cpf: cleanCpf,
      phone: cleanPhone,
      passwordHash,
      role: "CLIENTE",
      clientId: client.id,
    };
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data, select: { id: true, name: true, email: true, cpf: true, phone: true } })
      : await prisma.user.create({ data, select: { id: true, name: true, email: true, cpf: true, phone: true } });
    res.status(existing ? 200 : 201).json(user);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Já existe um login com esse email, CPF ou telefone." });
    throw err;
  }
});

// Self-service white-label branding for the client's OWN patients' portal —
// the client (professional) sets this from their own portal, not a sócio.
// Never touches planType, which stays a commercial decision made by a sócio.
router.patch("/me/branding", requireRole("CLIENTE"), async (req, res) => {
  if (!req.user.clientId) return res.status(400).json({ error: "Login não vinculado a um cliente." });
  const { brandName, logoBase64, logoMimeType } = req.body || {};
  if (logoBase64 && logoBase64.length > 3_000_000) {
    return res.status(400).json({ error: "Imagem muito grande — use um arquivo menor (até ~2MB)." });
  }
  const client = await prisma.client.update({
    where: { id: req.user.clientId },
    data: {
      ...(brandName !== undefined && { brandName: brandName || null }),
      ...(logoBase64 !== undefined && { logoBase64: logoBase64 || null }),
      ...(logoMimeType !== undefined && { logoMimeType: logoMimeType || null }),
    },
    select: { id: true, brandName: true, logoBase64: true, logoMimeType: true },
  });
  res.json(client);
});

// Shared by both branches of PATCH /:id below: builds the
// nextOptimizationDate/lastOptimizedAt part of the update. `existing` is the
// client row before this update (needed either way: to recompute the next
// date off the OLD optimizationDay when it's changing, or to advance off the
// current nextOptimizationDate when marking today's otimização done).
function optimizationPatch(existing, { optimizationDay, markOptimized }) {
  const data = {};
  const dayChanging = optimizationDay !== undefined
    && (optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null) !== existing.optimizationDay;
  if (dayChanging) {
    const newDay = optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null;
    data.nextOptimizationDate = newDay != null ? nextOccurrence(newDay, new Date()) : null;
  }
  if (markOptimized) {
    data.nextOptimizationDate = advanceAfterOptimizing(existing);
    data.lastOptimizedAt = new Date();
  }
  return data;
}

router.patch("/:id", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  // A gestor may only touch their own clients, and only a limited field set:
  // day-to-day notes plus the fields they're responsible for operationally
  // (including marking the weekly otimização as feita — it's their job).
  if (req.user.role === "GESTOR") {
    const owned = await prisma.client.findFirst({ where: { id: req.params.id, gestorId: req.user.id } });
    if (!owned) return res.status(403).json({ error: "Você não tem acesso a esse cliente." });
    const { notes, optimizationDay, activeCreative, markOptimized } = req.body || {};
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(notes !== undefined && { notes }),
        ...(optimizationDay !== undefined && { optimizationDay: optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null }),
        ...(activeCreative !== undefined && { activeCreative: activeCreative || null }),
        ...optimizationPatch(owned, { optimizationDay, markOptimized }),
      },
    });
    return res.json(client);
  }

  const { name, niche, status, plan, monthlyValue, dailyAdBudget, startDate, gestorId, notes, optimizationDay, activeCreative, planType, markOptimized, services, otherServiceNote, countsInFinance } = req.body || {};
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Cliente não encontrado." });
    const cleanServices = services !== undefined ? sanitizeServices(services) : undefined;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(niche !== undefined && { niche }),
        ...(status !== undefined && { status }),
        ...(plan !== undefined && { plan }),
        ...(monthlyValue !== undefined && { monthlyValue: monthlyValue != null ? Number(monthlyValue) : null }),
        ...(dailyAdBudget !== undefined && { dailyAdBudget: dailyAdBudget != null ? Number(dailyAdBudget) : null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(gestorId !== undefined && { gestorId: gestorId || null }),
        ...(notes !== undefined && { notes }),
        ...(optimizationDay !== undefined && { optimizationDay: optimizationDay != null && optimizationDay !== "" ? Number(optimizationDay) : null }),
        ...(activeCreative !== undefined && { activeCreative: activeCreative || null }),
        ...(planType !== undefined && { planType: planType === "SO_SISTEMA" ? "SO_SISTEMA" : "COMPLETO" }),
        ...(cleanServices !== undefined && { services: cleanServices, otherServiceNote: cleanServices.includes("OUTRO") ? (otherServiceNote || null) : null }),
        ...(countsInFinance !== undefined && { countsInFinance: !!countsInFinance }),
        ...optimizationPatch(existing, { optimizationDay, markOptimized }),
      },
    });
    res.json(client);
  } catch (err) {
    res.status(404).json({ error: "Cliente não encontrado." });
  }
});

router.delete("/:id", requireRole("SOCIO"), async (req, res) => {
  try {
    // Apaga também o login do portal desse cliente (role CLIENTE vinculado a
    // ele) — senão sobra uma conta órfã sem nenhum cliente pra acessar.
    // Pagamentos, tarefas, pendências, leads, pacientes etc. já cascateiam
    // pelo schema (onDelete: Cascade).
    await prisma.user.deleteMany({ where: { clientId: req.params.id } });
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: "Cliente não encontrado." });
  }
});

module.exports = router;
