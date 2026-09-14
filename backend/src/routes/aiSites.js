const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { callClaudeRaw } = require("../lib/claude");
const { isNetlifyConfigured, publishHtml } = require("../lib/netlify");

// Construtor de sites com IA — chat + prévia ao vivo, uso INTERNO (só
// sócio/gestor, nunca atendente/cliente). Cada "projeto" é uma conversa que
// vai gerando/atualizando um site inteiro; a última mensagem do assistente
// que trouxe HTML é sempre a versão atual (ver htmlSnapshot no schema).
const router = express.Router();
router.use(requireAuth, requireRole("SOCIO", "GESTOR"));

const MAX_HISTORY_MESSAGES = 30;
const MAX_TOKENS = 8000; // página inteira em HTML/CSS/JS pode ser longa
// Limites pensados pra caber com folga dentro do limite de 8mb do body JSON
// (express.json em server.js) somando todas as fotos de uma mensagem só.
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BASE64_LENGTH = 1_600_000; // ~1.2MB de imagem já redimensionada no navegador

// Instruído pra SEMPRE tentar entregar uma primeira versão de cara (mesmo
// que com escolhas próprias de cor/estilo), do jeito que a gente faz aqui no
// chat — só pergunta antes de gerar se o pedido for tão vago que não dá nem
// pra começar. Pedido explícito do usuário (13/09/2026) depois de ver a IA
// travando em 3 perguntas antes de mostrar qualquer coisa.
const SYSTEM_PROMPT = `Você é um construtor de sites, usado INTERNAMENTE pela equipe de uma agência de tráfego pago (TurbinaADS) — quem está te pedindo o site é um sócio ou gestor da agência, criando uma landing page ou site para um cliente da agência. Você nunca fala com o cliente final, só com a equipe interna.

MUITO IMPORTANTE — não trave pedindo informação: assim que souber o nicho/negócio e o objetivo básico da página (ex: "landing page pra psicóloga infantil, agendamento via WhatsApp"), gere a primeira versão completa JÁ NESSA RESPOSTA, fazendo escolhas de design (paleta, estilo, textos, seções) por conta própria, do jeito que você faria numa conversa direta comigo — nunca peça uma lista de informações antes de mostrar algo. Só faça uma pergunta objetiva, sem gerar HTML, se o pedido for tão vago que não dá nem pra começar (ex: só "me faz um site"). Depois da primeira versão, o gestor ajusta pedindo mudanças — é assim que o processo funciona, igual uma conversa normal de revisão.

FOTOS: quando a mensagem do usuário incluir uma lista de "Fotos disponíveis nesse projeto", você TEM que usar essas fotos nas tags <img> da página, usando exatamente o token indicado dentro do atributo src, assim: <img src="{{FOTO:foto-1}}" alt="descrição real da foto">. Nunca invente outro token, nunca escreva a foto errada pro lugar errado (ex: não bote uma foto de fachada como se fosse retrato de pessoa) — você pode VER cada foto anexada na conversa, use isso pra decidir onde cada uma fica melhor (hero, seção "sobre", galeria etc). NUNCA use um link de imagem externo (unsplash, placeholder.com, etc) nem invente um src que não seja um token de foto real — se a página pede uma imagem e não tem nenhuma foto disponível ainda, resolva com design (gradiente, ícone, formas), nunca com uma URL inventada.

PADRÃO DE QUALIDADE VISUAL — o mesmo cuidado de design usado numa conversa direta pra criar site, nunca o resultado genérico de "gerador automático de landing page":
- Baseie cada escolha no negócio/pessoa REAL descrito na conversa — nunca um layout que serviria igual pra qualquer nicho. Textos específicos e reais (nunca "Lorem ipsum", nunca frase vazia tipo "Bem-vindo ao nosso site" ou "Transforme sua vida hoje").
- Escolha DUAS fontes do Google Fonts que combinem entre si e com o tom do negócio — uma de destaque pra títulos (com personalidade — serif editorial pra algo acolhedor/terapêutico, geométrica forte pra algo técnico/moderno, etc.) e uma discreta pro texto corrido. Nunca as escolhas óbvias demais sem motivo (Inter/Roboto puro, Poppins genérico).
- Defina uma paleta de cor intencional — 3 a 5 cores, incluindo um neutro que não seja cinza puro. NUNCA as combinações batidas de site gerado por IA: creme + terracota, preto quase puro com um verde-neon isolado, gradiente roxo-pro-azul em fundo branco. A cor de destaque tem que ter a ver com o nicho (e com as cores da marca do cliente, se souber quais são).
- A seção de abertura (hero) é a tese da página — abra com a coisa mais característica daquele negócio: a foto certa, uma frase de posicionamento real e específica, nunca um clichê genérico.
- Evite os vícios visuais de site feito por IA: tudo centralizado, cantos arredondados em toda superfície sem motivo, cards com barrinha colorida do lado, emoji como marcador de seção, número decorativo (01/02/03) sem o conteúdo ser de fato uma sequência. Cada decisão de layout precisa ter uma razão ligada ao conteúdo.
- Responsivo de verdade (funciona bem no celular, não só no preview de desktop), hierarquia tipográfica clara, espaço de respiro generoso entre seções — nunca tudo grudado.
- No comentário curto antes do bloco de código, mencione rapidamente a escolha de estilo (cor, fonte, tom) — assim quem está pedindo entende a decisão de design, não só recebe "site pronto".

Sempre que for ENTREGAR ou ATUALIZAR o site, responda EXATAMENTE neste formato:
1. Uma ou duas frases curtas em português contando o que você fez (ou o que mudou).
2. Um bloco de código começando com \`\`\`html e terminando com \`\`\`, contendo a página COMPLETA: um único arquivo HTML autossuficiente, com todo CSS e JS embutido dentro do próprio <head>/<body> (nada de arquivo externo, exceto uma fonte do Google Fonts se fizer sentido, e as tags {{FOTO:token}} descritas acima). Sempre mande o HTML inteiro atualizado nesse bloco, nunca só o trecho que mudou — quem lê essa mensagem substitui a prévia inteira pelo conteúdo desse bloco.

Boas práticas obrigatórias: layout responsivo (funciona bem no celular), hierarquia tipográfica clara, paleta de cores coerente com o nicho/marca do cliente. Nunca inclua comentários de desculpa ou explicações longas fora das duas frases iniciais — o gestor só quer ver o resultado.`;

function extractHtml(text) {
  const m = String(text || "").match(/```html\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function stripHtmlBlock(text) {
  return String(text || "").replace(/```html[\s\S]*?```/i, "").trim();
}

// Troca cada {{FOTO:token}} pela foto de verdade (data URL) — feito só na
// hora de SERVIR o HTML (prévia/download), nunca antes de guardar no banco
// nem antes de reenviar como contexto pra IA (ver buildSiteApiMessages).
function substituteFotos(html, images) {
  if (!html) return html;
  return html.replace(/\{\{FOTO:([a-zA-Z0-9_-]+)\}\}/g, (match, token) => {
    const img = images.find((i) => i.token === token);
    return img ? `data:${img.mimeType};base64,${img.dataBase64}` : "";
  });
}

// Busca o HTML mais recente do projeto (ainda com token, {{FOTO:x}}) e todas
// as fotos disponíveis — usado tanto na tela do chat (GET /:id) quanto na
// publicação (POST /:id/publish), pra não duplicar a mesma consulta.
async function getRawHtmlAndImages(projectId) {
  const [rows, images] = await Promise.all([
    prisma.aiSiteMessage.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 40, select: { htmlSnapshot: true } }),
    prisma.aiSiteImage.findMany({ where: { projectId } }),
  ]);
  const rawHtml = rows.find((r) => r.htmlSnapshot)?.htmlSnapshot || null;
  return { rawHtml, images };
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
// princípio já usado em ai.js pra anexos antigos (buildApiMessages). O HTML
// guardado/reenviado aqui é sempre a versão COM TOKEN ({{FOTO:x}}), nunca
// com a foto de verdade embutida — senão o custo de tokens explodiria junto.
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

  const [rows, images] = await Promise.all([
    prisma.aiSiteMessage.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } }),
    prisma.aiSiteImage.findMany({ where: { projectId: project.id }, select: { id: true, token: true, name: true, messageId: true } }),
  ]);

  const messages = rows.map((r) => ({
    id: r.id,
    role: r.role,
    text: r.role === "assistant" ? stripHtmlBlock(r.content) || "✅ Site atualizado — veja a prévia." : r.content,
    hasHtml: !!r.htmlSnapshot,
    imageCount: images.filter((img) => img.messageId === r.id).length,
    createdAt: r.createdAt,
  }));
  const rawHtml = [...rows].reverse().find((r) => r.htmlSnapshot)?.htmlSnapshot || null;

  res.json({
    project,
    messages,
    currentHtml: substituteFotos(rawHtml, images),
    photoCount: images.length,
  });
});

router.delete("/:id", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado ou sem acesso." });
  await prisma.aiSiteProject.delete({ where: { id: project.id } });
  res.status(204).end();
});

// Publica o site gerado direto na Netlify (14/09/2026) — primeira vez cria
// o site lá, publicações seguintes do mesmo projeto atualizam o mesmo link
// (netlifySiteId salvo no projeto) em vez de gerar um novo toda hora.
router.post("/:id/publish", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado ou sem acesso." });

  if (!isNetlifyConfigured()) {
    return res.status(501).json({ error: "Publicação ainda não configurada — falta a chave da Netlify (NETLIFY_TOKEN) nas variáveis de ambiente do backend." });
  }

  const { rawHtml, images } = await getRawHtmlAndImages(project.id);
  if (!rawHtml) return res.status(400).json({ error: "Ainda não há nenhum site gerado nesse projeto pra publicar." });
  const html = substituteFotos(rawHtml, images);

  try {
    const { siteId, url } = await publishHtml({ existingSiteId: project.netlifySiteId, name: project.name, html });
    await prisma.aiSiteProject.update({ where: { id: project.id }, data: { netlifySiteId: siteId, netlifyUrl: url, publishedAt: new Date() } });
    res.json({ url });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

router.post("/:id/messages", async (req, res) => {
  const project = await assertProjectAccess(req, req.params.id);
  if (!project) return res.status(404).json({ error: "Projeto não encontrado ou sem acesso." });

  const { message, images: newImagesInput } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: "Escreva uma mensagem." });
  const userText = String(message).trim();

  const newImages = Array.isArray(newImagesInput) ? newImagesInput.slice(0, MAX_IMAGES_PER_MESSAGE) : [];
  for (const img of newImages) {
    if (!img || typeof img.dataBase64 !== "string" || !img.dataBase64) {
      return res.status(400).json({ error: "Foto inválida no anexo." });
    }
    if (!img.mimeType || !String(img.mimeType).startsWith("image/")) {
      return res.status(400).json({ error: "Só é possível anexar arquivos de imagem." });
    }
    if (img.dataBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return res.status(400).json({ error: "Uma das fotos ficou grande demais mesmo depois de redimensionada — tente outra." });
    }
  }

  try {
    // Salva a mensagem do usuário já de cara — mesmo que a chamada à IA
    // falhe depois, o que foi digitado/anexado não se perde.
    const userRow = await prisma.aiSiteMessage.create({ data: { projectId: project.id, role: "user", content: userText } });

    // Cada foto ganha um token sequencial ÚNICO dentro do projeto inteiro
    // (não só dessa mensagem) — assim a IA consegue reusar fotos de
    // mensagens anteriores em edições futuras, sem precisar reenviá-las.
    const existingCount = await prisma.aiSiteImage.count({ where: { projectId: project.id } });
    const createdImages = [];
    for (let i = 0; i < newImages.length; i++) {
      const img = newImages[i];
      const token = `foto-${existingCount + i + 1}`;
      const row = await prisma.aiSiteImage.create({
        data: {
          projectId: project.id,
          messageId: userRow.id,
          token,
          name: img.name ? String(img.name).slice(0, 200) : null,
          mimeType: img.mimeType,
          dataBase64: img.dataBase64,
        },
      });
      createdImages.push(row);
    }

    const priorRows = await prisma.aiSiteMessage.findMany({
      where: { projectId: project.id, id: { not: userRow.id } },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true, htmlSnapshot: true },
    });
    priorRows.reverse();

    // Lista de TODAS as fotos já disponíveis nesse projeto (não só as novas
    // dessa mensagem) — garante que a IA saiba dos tokens mesmo em edições
    // futuras sem precisar re-enviar/re-ver a foto de novo.
    const allImages = await prisma.aiSiteImage.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });

    let userContent = userText;
    if (allImages.length) {
      const listagem = allImages.map((img) => `${img.token} (${img.name || "sem nome"})`).join(", ");
      userContent = `${userText}\n\n[Fotos disponíveis nesse projeto — use exatamente esse token dentro de src="{{FOTO:token}}" numa tag <img>, nunca invente outro token nem use URL externa: ${listagem}]`;
    }
    // As fotos ANEXADAS NESSA MENSAGEM (não as antigas) viram blocos de
    // imagem de verdade, pra IA poder efetivamente ver o conteúdo de cada
    // uma e decidir onde cada uma fica melhor no layout.
    if (createdImages.length) {
      const blocks = [{ type: "text", text: userContent }];
      for (const img of createdImages) {
        blocks.push({ type: "image", source: { type: "base64", media_type: img.mimeType, data: img.dataBase64 } });
        blocks.push({ type: "text", text: `(a foto acima é o token ${img.token})` });
      }
      userContent = blocks;
    }

    const apiMessages = buildSiteApiMessages([...priorRows, { role: "user", content: userContent, htmlSnapshot: null }]);
    const raw = await callClaudeRaw({ system: SYSTEM_PROMPT, messages: apiMessages, maxTokens: MAX_TOKENS });
    const html = extractHtml(raw); // guardado/reenviado sempre com token, nunca com a foto embutida

    await prisma.aiSiteMessage.create({ data: { projectId: project.id, role: "assistant", content: raw, htmlSnapshot: html } });
    await prisma.aiSiteProject.update({ where: { id: project.id }, data: { updatedAt: new Date() } });

    res.json({
      text: stripHtmlBlock(raw) || "✅ Site atualizado — veja a prévia.",
      htmlSnapshot: substituteFotos(html, allImages),
    });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

module.exports = router;
