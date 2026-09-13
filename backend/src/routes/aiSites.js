const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { callClaudeRaw } = require("../lib/claude");

// Construtor de sites com IA — chat + prévia ao vivo, uso INTERNO (só
// sócio/gestor, nunca atendente/cliente). Cada "projeto" é uma conversa que
// vai gerando/atualizando um site inteiro; a última mensagem do assistente
// que trouxe HTML é sempre a versão atual (ver htmlSnapshot no schema).
const router = express.Router();
router.use(requireAuth, requireRole("SOCIO", "GESTOR"));

const MAX_HISTORY_MESSAGES = 30;
const MAX_TOKENS = 8000; // página inteira em HTML/CSS/JS pode ser longa

const SYSTEM_PROMPT = `Você é um construtor de sites, usado INTERNAMENTE pela equipe de uma agência de tráfego pago (TurbinaADS) — quem está te pedindo o site é um sócio ou gestor da agência, criando uma landing page ou site para um cliente da agência. Você nunca fala com o cliente final, só com a equipe interna.

Sempre que for ENTREGAR ou ATUALIZAR o site, responda EXATAMENTE neste formato:
1. Uma ou duas frases curtas em português contando o que você fez (ou o que mudou).
2. Um bloco de código começando com \`\`\`html e terminando com \`\`\`, contendo a página COMPLETA: um único arquivo HTML autossuficiente, com todo CSS e JS embutido dentro do próprio <head>/<body> (nada de arquivo externo, exceto uma fonte do Google Fonts se fizer sentido). Sempre mande o HTML inteiro atualizado nesse bloco, nunca só o trecho que mudou — quem lê essa mensagem substitui a prévia inteira pelo conteúdo desse bloco.

Se o pedido ainda não tiver informação suficiente pra gerar algo útil (não sabe do que é o negócio do cliente, nem o objetivo da página), faça só a(s) pergunta(s) necessária(s), SEM bloco de código — só gere o HTML quando já tiver o mínimo pra entregar algo de verdade.

Boas práticas obrigatórias: layout responsivo (funciona bem no celular), hierarquia tipográfica clara, paleta de cores coerente com o nicho/marca do cliente (pergunte cores/estilo se não souber), sem depender de nenhuma biblioteca externa além de fontes do Google Fonts. Nunca inclua comentários de desculpa ou explicações longas fora das duas frases iniciais — o gestor só quer ver o resultado.`;

function extractHtml(text) {
  const m = String(text || "").match(/```html\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function stripHtmlBlock(text) {
  return String(text || "").replace(/```html[\s\S]*?```/i, "").trim();
}

async function assertProjectAccess(req, id) {
  const project = await prisma.aiSiteProject.findUnique({ where: { id } });
  if (!project) return null;
  if (req.user.role === "SOCIO" || project.createdById === req.user.id) return project;
  return null;
}

// Monta as mensagens pra API a partir do histórico salvo: só a ÚLTIMA
// mensagem do assistente mantém o HTML completo (é o que a IA precisa ver
// pra editar a versão atual); turnos anteriores com site têm o HTML trocado
// por um resumo curto, senão o custo/tokens de uma conversa longa explodiria
// reenviando cada versão inteira da página a cada mensagem nova — mesmo
// princípio já usado em ai.js pra anexos antigos (buildApiMessages).
function buildSiteApiMessages(rows) {
  return rows.map((row, i) => {
    const isLast = i === rows.length - 1;
    if (row.role === "assistant" && row.htmlSnapshot && !isLast) {
      const comentario = stripHtmlBlock(row.content);
      return {
        role: "assistant",
        content: `${comentario}\n\n[versão do site gerada nesse turno — omitida aqui pra não repetir HTML inteiro a cada mensagem; a versão mais atual é reenviada normalmente]`,
      };
    }
    return { role: row.role, content: row.content };
  });
}

router.get("/", async (req, res) => {
  const where = req.user.role === "SOCIO" ? {} : { createdById: req.user.id };
  const projects = await prisma.aiSiteProject.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { client: { select: { name: true } }, createdBy: { select: { name: true } }, _count: { select: { messages: true } } },
  });
  res.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client?.name || null,
      createdByName: p.createdBy?.name || null,
      updatedAt: p.updatedAt,
      messageCount: p._count.messages,
    })),
  });
});

router.post("/", async (req, res) => {
  const { name, clientId } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Dê um nome pro projeto." });

  let client = null;
  if (clientId) {
    client =
      req.user.role === "SOCIO"
        ? await prisma.client.findUnique({ where: { id: clientId } })
        : await prisma.client.findFirst({ where: { id: clientId, gestorId: req.user.id } });
    if (!client) return res.status(404).json({ error: "Cliente não encontrado ou sem acesso." });
  }

  const project = await prisma.aiSiteProject.create({
    data: { name: String(name).trim(), clientId: client?.id || null, createdById: req.user.id },
  });
  res.status(201).json(project);
});

router.get("/:id", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado ou sem acesso." });

  const rows = await prisma.aiSiteMessage.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  const messages = rows.map((r) => ({
    id: r.id,
    role: r.role,
    text: r.role === "assistant" ? stripHtmlBlock(r.content) || "✅ Site atualizado — veja a prévia." : r.content,
    hasHtml: !!r.htmlSnapshot,
    createdAt: r.createdAt,
  }));
  const currentHtml = [...rows].reverse().find((r) => r.htmlSnapshot)?.htmlSnapshot || null;

  res.json({ project, messages, currentHtml });
});

router.delete("/:id", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado ou sem acesso." });
  await prisma.aiSiteProject.delete({ where: { id: project.id } });
  res.status(204).end();
});

router.post("/:id/messages", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado ou sem acesso." });

  const { message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: "Escreva uma mensagem." });
  const userText = String(message).trim();

  try {
    const priorRows = await prisma.aiSiteMessage.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true, htmlSnapshot: true },
    });
    priorRows.reverse();

    // Salva a mensagem do usuário já de cara — mesmo que a chamada à IA
    // falhe depois, o que foi digitado não se perde.
    await prisma.aiSiteMessage.create({ data: { projectId: project.id, role: "user", content: userText } });

    const apiMessages = buildSiteApiMessages([...priorRows, { role: "user", content: userText, htmlSnapshot: null }]);
    const raw = await callClaudeRaw({ system: SYSTEM_PROMPT, messages: apiMessages, maxTokens: MAX_TOKENS });
    const html = extractHtml(raw);

    await prisma.aiSiteMessage.create({ data: { projectId: project.id, role: "assistant", content: raw, htmlSnapshot: html } });
    await prisma.aiSiteProject.update({ where: { id: project.id }, data: { updatedAt: new Date() } });

    res.json({ text: stripHtmlBlock(raw) || "✅ Site atualizado — veja a prévia.", htmlSnapshot: html });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

module.exports = router;
