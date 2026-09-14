const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { isNetlifyConfigured, publishHtml, slugify } = require("../lib/netlify");

// Publicação de sites em HTML pronto (14/09/2026) — uso INTERNO, só sócio/
// gestor. O site em si é feito do jeito que a equipe já faz normalmente
// (ex: no chat com a IA aqui direto), baixado como .html e subido aqui só
// pra publicar/atualizar no ar via Netlify, com o subdomínio escolhido na
// hora. Substitui a versão anterior (chat + IA gerando o site aos poucos),
// removida a pedido da sócia — o resultado automático não ficava bom.
const router = express.Router();
router.use(requireAuth, requireRole("SOCIO", "GESTOR"));

// ~30MB de HTML como texto — folga generosa sob o limite de 35mb do body
// JSON (server.js), já que o HTML pode ter fotos/vídeo embutidos como
// data URL (o mesmo jeito que a IA aqui no chat entrega os sites).
const MAX_HTML_LENGTH = 30_000_000;

async function assertProjectAccess(req, id) {
  const project = await prisma.aiSiteProject.findUnique({ where: { id } });
  if (!project) return null;
  if (req.user.role === "SOCIO" || project.createdById === req.user.id) return project;
  return null;
}

function serialize(p) {
  return {
    id: p.id,
    name: p.name,
    subdomain: p.subdomain,
    clientId: p.clientId,
    clientName: p.client?.name || null,
    createdByName: p.createdBy?.name || null,
    netlifyUrl: p.netlifyUrl,
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}

// Lista sites publicados — opcionalmente filtrado por cliente (usado dentro
// da própria página do cliente, pra mostrar só o site dele ali).
router.get("/", async (req, res) => {
  const where = req.user.role === "SOCIO" ? {} : { createdById: req.user.id };
  if (req.query.clientId) where.clientId = req.query.clientId;

  const projects = await prisma.aiSiteProject.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
  res.json({ projects: projects.map(serialize) });
});

router.get("/:id", async (req, res) => {
  const project = await prisma.aiSiteProject.findUnique({
    where: { id: req.params.id },
    include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
  if (!project) return res.status(404).json({ error: "Site não encontrado." });
  if (req.user.role !== "SOCIO" && project.createdById !== req.user.id) {
    return res.status(404).json({ error: "Site não encontrado ou sem acesso." });
  }
  res.json(serialize(project));
});

router.delete("/:id", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Site não encontrado ou sem acesso." });
  // Só apaga o registro aqui dentro do sistema — não derruba o site lá na
  // Netlify (evita apagar sem querer um site que o cliente já divulgou).
  await prisma.aiSiteProject.delete({ where: { id: project.id } });
  res.status(204).end();
});

// Publica um HTML pronto — sem projectId cria um site novo (com o
// subdomínio escolhido); com projectId atualiza o conteúdo do mesmo site já
// existente (mantém o mesmo link, ignora o campo subdomain no corpo).
router.post("/publish", async (req, res) => {
  if (!isNetlifyConfigured()) {
    return res.status(501).json({ error: "Publicação ainda não configurada — falta a chave da Netlify (NETLIFY_TOKEN) nas variáveis de ambiente do backend." });
  }

  const { projectId, name, subdomain, clientId, html } = req.body || {};

  if (!html || typeof html !== "string" || !html.trim()) {
    return res.status(400).json({ error: "Anexe o arquivo .html do site." });
  }
  if (html.length > MAX_HTML_LENGTH) {
    return res.status(400).json({ error: "Esse arquivo HTML ficou grande demais pra publicar." });
  }

  try {
    let project = null;
    if (projectId) {
      project = await assertProjectAccess(req, projectId);
      if (!project) return res.status(404).json({ error: "Site não encontrado ou sem acesso." });
    } else {
      if (!name || !String(name).trim()) return res.status(400).json({ error: "Dê um nome pro site." });
      if (!subdomain || !slugify(subdomain)) return res.status(400).json({ error: "Escolha um início de subdomínio válido (letras e números)." });
    }

    let client = null;
    if (clientId) {
      client =
        req.user.role === "SOCIO"
          ? await prisma.client.findUnique({ where: { id: clientId } })
          : await prisma.client.findFirst({ where: { id: clientId, gestorId: req.user.id } });
      if (!client) return res.status(404).json({ error: "Cliente não encontrado ou sem acesso." });
    }

    const { siteId, url, name: netlifyName } = await publishHtml({
      existingSiteId: project?.netlifySiteId || null,
      subdomain: project ? project.subdomain : subdomain,
      html,
    });

    if (project) {
      project = await prisma.aiSiteProject.update({
        where: { id: project.id },
        data: {
          netlifySiteId: siteId,
          netlifyUrl: url,
          publishedAt: new Date(),
          ...(clientId !== undefined ? { clientId: client?.id || null } : {}),
        },
        include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
      });
    } else {
      project = await prisma.aiSiteProject.create({
        data: {
          name: String(name).trim(),
          subdomain: netlifyName || slugify(subdomain),
          clientId: client?.id || null,
          createdById: req.user.id,
          netlifySiteId: siteId,
          netlifyUrl: url,
          publishedAt: new Date(),
        },
        include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
      });
    }

    res.json(serialize(project));
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

module.exports = router;
