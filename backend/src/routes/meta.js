const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
// Only sócio/gestor deal with ad accounts — clients never see this router.
router.use(requireRole("SOCIO", "GESTOR"));

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const ACCOUNT_STATUS_LABEL = {
  1: "ATIVA",
  2: "DESATIVADA",
  3: "SEM ACERTO DE CONTAS",
  7: "EM REVISÃO DE RISCO",
  8: "PENDENTE DE PAGAMENTO",
  9: "EM PERÍODO DE CARÊNCIA",
  100: "FECHAMENTO PENDENTE",
  101: "FECHADA",
};

function notConfiguredError() {
  const err = new Error(
    "Integração com Meta Ads ainda não configurada. Peça ao sócio para adicionar META_APP_ID e META_APP_SECRET nas variáveis de ambiente do backend (Railway)."
  );
  err.notConfigured = true;
  return err;
}

async function graphGet(path, params, accessToken) {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const r = await fetch(`${GRAPH_BASE}${path}?${qs.toString()}`);
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.error) {
    throw new Error(data?.error?.message || "Erro ao consultar a API do Meta.");
  }
  return data;
}

async function getActiveConnection() {
  return prisma.metaConnection.findFirst({ orderBy: { createdAt: "desc" } });
}

async function requireActiveConnection() {
  const conn = await getActiveConnection();
  if (!conn) {
    const err = new Error("Nenhuma conta do Meta conectada ainda. Conecte sua conta de anúncios primeiro.");
    err.notConnected = true;
    throw err;
  }
  if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date()) {
    const err = new Error("A conexão com o Meta expirou. Reconecte sua conta de anúncios.");
    err.notConnected = true;
    throw err;
  }
  return conn;
}

// Which ad accounts this user is allowed to see: sócio sees all, gestor only
// the ones mapped to a client they manage.
async function accountsWhereForUser(req) {
  if (req.user.role === "SOCIO") return {};
  return { client: { gestorId: req.user.id } };
}

router.get("/status", async (req, res) => {
  const conn = await getActiveConnection();
  if (!conn) return res.json({ connected: false });
  const expired = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) < new Date() : false;
  res.json({
    connected: !expired,
    expired,
    metaUserName: conn.metaUserName,
    connectedAt: conn.createdAt,
    tokenExpiresAt: conn.tokenExpiresAt,
  });
});

// Body: { accessToken } — the SHORT-LIVED token the Facebook Login JS SDK
// hands back client-side (scope must include ads_read). Exchanged here,
// server-side, for a long-lived token — the short-lived one is never stored.
router.post("/connect", requireRole("SOCIO"), async (req, res) => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw notConfiguredError();

  const { accessToken } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: "Token de acesso do Meta não informado." });

  try {
    const exchanged = await graphGet(
      "/oauth/access_token",
      { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: accessToken },
      accessToken
    );
    const longLivedToken = exchanged.access_token;
    const expiresInSec = exchanged.expires_in; // long-lived user tokens: ~60 days
    const me = await graphGet("/me", { fields: "id,name" }, longLivedToken);

    const conn = await prisma.metaConnection.create({
      data: {
        accessToken: longLivedToken,
        tokenExpiresAt: expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null,
        metaUserId: me.id,
        metaUserName: me.name,
        connectedById: req.user.id,
      },
    });
    res.status(201).json({ connected: true, metaUserName: conn.metaUserName, connectedAt: conn.createdAt });
  } catch (err) {
    res.status(400).json({ error: err.message || "Não foi possível conectar a conta do Meta." });
  }
});

router.post("/disconnect", requireRole("SOCIO"), async (req, res) => {
  await prisma.metaConnection.deleteMany({});
  res.status(204).end();
});

// Pulls the list of ad accounts the connected Meta login can manage and
// upserts them locally (name/currency/status). Mapping to a client is a
// separate, manual step (PATCH /ad-accounts/:id) — discovery never guesses it.
router.post("/sync-accounts", requireRole("SOCIO"), async (req, res) => {
  try {
    const conn = await requireActiveConnection();
    const data = await graphGet(
      "/me/adaccounts",
      { fields: "account_id,name,currency,account_status", limit: "200" },
      conn.accessToken
    );
    const accounts = data.data || [];
    const results = [];
    for (const acc of accounts) {
      const metaAccountId = `act_${acc.account_id}`;
      const saved = await prisma.adAccount.upsert({
        where: { metaAccountId },
        update: { name: acc.name, currency: acc.currency || null, accountStatus: ACCOUNT_STATUS_LABEL[acc.account_status] || String(acc.account_status) },
        create: {
          metaAccountId,
          name: acc.name,
          currency: acc.currency || null,
          accountStatus: ACCOUNT_STATUS_LABEL[acc.account_status] || String(acc.account_status),
        },
      });
      results.push(saved);
    }
    res.json({ synced: results.length, accounts: results });
  } catch (err) {
    res.status(err.notConnected ? 409 : 400).json({ error: err.message || "Erro ao sincronizar contas de anúncio." });
  }
});

router.get("/ad-accounts", async (req, res) => {
  const where = await accountsWhereForUser(req);
  const accounts = await prisma.adAccount.findMany({
    where,
    include: { client: { select: { id: true, name: true, gestorId: true } } },
    orderBy: { name: "asc" },
  });
  res.json(accounts);
});

router.patch("/ad-accounts/:id", requireRole("SOCIO"), async (req, res) => {
  const { clientId } = req.body || {};
  try {
    const account = await prisma.adAccount.update({
      where: { id: req.params.id },
      data: { clientId: clientId || null },
      include: { client: { select: { id: true, name: true } } },
    });
    res.json(account);
  } catch (err) {
    res.status(404).json({ error: "Conta de anúncio não encontrada." });
  }
});

// Simple "is this account looking bad" heuristic — flags, not verdicts, so
// staff can triage a long list of client accounts at a glance.
function computeAlerts(m) {
  const alerts = [];
  const ctr = Number(m.ctr || 0);
  const frequency = Number(m.frequency || 0);
  const cpc = Number(m.cpc || 0);
  if (m.impressions > 500 && ctr > 0 && ctr < 1) alerts.push("CTR baixo (abaixo de 1%)");
  if (frequency > 3.5) alerts.push("Frequência alta (anúncio pode estar saturado)");
  if (cpc > 0 && cpc > 5) alerts.push("CPC alto");
  return alerts;
}

router.get("/ad-accounts/:id/insights", async (req, res) => {
  const account = await prisma.adAccount.findUnique({ where: { id: req.params.id }, include: { client: true } });
  if (!account) return res.status(404).json({ error: "Conta de anúncio não encontrada." });
  if (req.user.role === "GESTOR" && account.client?.gestorId !== req.user.id) {
    return res.status(403).json({ error: "Sem acesso a essa conta de anúncio." });
  }

  try {
    const conn = await requireActiveConnection();
    const datePreset = req.query.datePreset || "last_30d";
    const data = await graphGet(
      `/${account.metaAccountId}/insights`,
      {
        fields: "spend,impressions,clicks,cpc,cpm,ctr,frequency,reach,actions,cost_per_action_type",
        date_preset: datePreset,
      },
      conn.accessToken
    );
    const row = (data.data || [])[0] || null;
    if (!row) return res.json({ hasData: false, alerts: [] });

    const leadActions = (row.actions || []).filter((a) => ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"].includes(a.action_type));
    const leadsCount = leadActions.reduce((sum, a) => sum + Number(a.value || 0), 0);
    const costPerLead = (row.cost_per_action_type || []).find((c) => ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"].includes(c.action_type));

    res.json({
      hasData: true,
      spend: Number(row.spend || 0),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      cpc: Number(row.cpc || 0),
      cpm: Number(row.cpm || 0),
      ctr: Number(row.ctr || 0),
      frequency: Number(row.frequency || 0),
      reach: Number(row.reach || 0),
      leadsCount,
      costPerLead: costPerLead ? Number(costPerLead.value) : null,
      datePreset,
      alerts: computeAlerts(row),
    });
  } catch (err) {
    res.status(err.notConnected ? 409 : 400).json({ error: err.message || "Erro ao buscar métricas da conta." });
  }
});

module.exports = router;
