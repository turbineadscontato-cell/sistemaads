const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertClientAccess(user, clientId) {
  if (user.role === "SOCIO") return true;
  if (user.role === "GESTOR") {
    const c = await prisma.client.findFirst({ where: { id: clientId, gestorId: user.id } });
    return !!c;
  }
  if (user.role === "CLIENTE") return user.clientId === clientId;
  return false;
}

// Best-effort parser for Meta Ads Manager exports saved/pasted as CSV
// (handles PT-BR and EN column headers, comma or semicolon separated).
function parseAdsCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return null;
  const splitLine = (l) => l.split(/,|;|\t/).map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  const findCol = (candidates) => headers.findIndex((h) => candidates.some((c) => h.includes(c)));

  const spendCol = findCol(["valor usado", "amount spent", "gasto"]);
  const impressionsCol = findCol(["impressões", "impressions"]);
  const clicksCol = findCol(["cliques", "clicks"]);
  const resultsCol = findCol(["resultados", "results", "leads"]);

  const toNumber = (v) => {
    if (!v) return 0;
    const n = Number(String(v).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  let spend = 0, impressions = 0, clicks = 0, leadsCount = 0;
  for (const line of lines.slice(1)) {
    const cols = splitLine(line);
    if (spendCol >= 0) spend += toNumber(cols[spendCol]);
    if (impressionsCol >= 0) impressions += toNumber(cols[impressionsCol]);
    if (clicksCol >= 0) clicks += toNumber(cols[clicksCol]);
    if (resultsCol >= 0) leadsCount += toNumber(cols[resultsCol]);
  }
  return { spend, impressions, clicks, leadsCount };
}

router.get("/:clientId", async (req, res) => {
  if (!(await assertClientAccess(req.user, req.params.clientId))) {
    return res.status(403).json({ error: "Sem acesso a esse cliente." });
  }
  const reports = await prisma.monthlyReport.findMany({
    where: { clientId: req.params.clientId },
    orderBy: { month: "desc" },
  });
  res.json(reports);
});

router.post("/:clientId", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  if (!(await assertClientAccess(req.user, req.params.clientId))) {
    return res.status(403).json({ error: "Sem acesso a esse cliente." });
  }
  const { month, csvText, sourceFileName, notes } = req.body || {};
  let { spend, impressions, clicks, leadsCount, fechamentos, revenue } = req.body || {};
  if (!month) return res.status(400).json({ error: "Informe o mês de referência." });

  if (csvText) {
    const parsed = parseAdsCsv(csvText);
    if (parsed) {
      if (spend === undefined || spend === "") spend = parsed.spend;
      if (impressions === undefined || impressions === "") impressions = parsed.impressions;
      if (clicks === undefined || clicks === "") clicks = parsed.clicks;
      if (leadsCount === undefined || leadsCount === "") leadsCount = parsed.leadsCount;
    }
  }

  const report = await prisma.monthlyReport.create({
    data: {
      clientId: req.params.clientId,
      month,
      spend: spend !== undefined && spend !== "" ? Number(spend) : null,
      impressions: impressions !== undefined && impressions !== "" ? Math.round(Number(impressions)) : null,
      clicks: clicks !== undefined && clicks !== "" ? Math.round(Number(clicks)) : null,
      leadsCount: leadsCount !== undefined && leadsCount !== "" ? Math.round(Number(leadsCount)) : null,
      fechamentos: fechamentos !== undefined && fechamentos !== "" ? Math.round(Number(fechamentos)) : null,
      revenue: revenue !== undefined && revenue !== "" ? Number(revenue) : null,
      notes: notes || null,
      sourceFileName: sourceFileName || null,
    },
  });
  res.status(201).json(report);
});

router.delete("/:id", requireRole("SOCIO"), async (req, res) => {
  try {
    await prisma.monthlyReport.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: "Relatório não encontrado." });
  }
});

module.exports = router;
