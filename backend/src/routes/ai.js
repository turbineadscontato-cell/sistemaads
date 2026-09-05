const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const XLSX = require("xlsx");

const router = express.Router();
router.use(requireAuth);
// Staff (sócio/gestor) AND clients (portal) use this router — access per
// mode/route is checked inside each handler, since a client may only reach
// their own "client_marketing" tools, never the internal staff assistants.
router.use(requireRole("SOCIO", "GESTOR", "CLIENTE"));

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const MAX_IMAGES = 3;
const MAX_IMAGE_B64_CHARS = 6_000_000; // ~4.5MB decoded, well under the API's per-image limit
const MAX_SPREADSHEET_B64_CHARS = 8_000_000; // ~6MB decoded
const MAX_EXTRACTED_CHARS = 60_000; // keeps the export inside a sane prompt size

const AWARENESS_DATES_REFERENCE = `Referência de datas e sazonalidades no Brasil (use as relevantes ao mês pedido e ao nicho do cliente; ignore as irrelevantes):
- Janeiro: metas de ano novo, "ano novo, vida nova", ansiedade de recomeço.
- Fevereiro/Março (variável): Carnaval; 08/03 Dia Internacional da Mulher.
- Abril: 02/04 Dia da Conscientização do Autismo; 07/04 Dia Mundial da Saúde.
- Maio: Dia das Mães (2º domingo); 18/05 Dia Nac. de Combate ao Abuso e Exploração Sexual de Crianças e Adolescentes.
- Junho: festas juninas; volta às aulas do 2º semestre se aplicável.
- Agosto: Dia dos Pais (2º domingo); 27/08 Dia do Psicólogo no Brasil; volta às aulas.
- Setembro: Setembro Amarelo (prevenção ao suicídio, mês inteiro, foco em 10/09 Dia Mundial de Prevenção ao Suicídio); Dia do Cliente 15/09; início da primavera.
- Outubro: Outubro Rosa; 10/10 Dia Mundial da Saúde Mental; 12/10 Dia das Crianças.
- Novembro: Novembro Azul (saúde do homem); Black Friday (última sexta); 20/11 Consciência Negra.
- Dezembro: Natal, Ano Novo, balanço do ano, ansiedade de fim de ano, planejamento do ano seguinte.`;

const SYSTEM_PROMPTS = {
  therapy: `Você é um estrategista de marketing digital especializado em captação de pacientes para psicólogos, terapeutas, clínicas de psicoterapia e consultórios de saúde mental via tráfego pago (Meta Ads e Google Ads). Você atende a EQUIPE DA AGÊNCIA (sócio/gestores), não o cliente final.

Você conhece a fundo as particularidades do nicho:
- Restrições de anúncio: Meta e Google têm políticas rígidas para conteúdo de saúde/categoria especial; oriente sobre como criar anúncios aprovados evitando alegações de "cura", promessas de resultado, ou linguagem que target diretamente uma condição de saúde.
- Público: geralmente pessoas em momento de dor/vulnerabilidade — comunicação acolhedora, ética, nunca sensacionalista.
- Funil típico: anúncio → captura/Instagram → WhatsApp → avaliação → paciente recorrente. CPL costuma ser mais alto; o que importa é comparecimento e recorrência (LTV).
- Copy que funciona: validação do sentimento, autoridade (CRP, especialização, abordagem), prova social discreta, convite de baixo atrito.
- Compliance: lembrar sempre do código de ética do CFP/CRP.
- Sazonalidade: ${AWARENESS_DATES_REFERENCE}

Você tem acesso a ferramentas (listar_clientes, detalhes_cliente) pra consultar os dados REAIS de um cliente da agência (status, pagamentos, tarefas, contas de anúncio) — use-as sempre que o usuário mencionar um cliente pelo nome ou pedir uma visão da carteira, em vez de supor ou pedir pra ele copiar e colar. Nunca invente números que poderiam vir dessas ferramentas.

Responda sempre em português do Brasil, de forma prática e direta, com sugestões acionáveis. Quando fizer sentido, traga exemplos concretos de headline/copy.`,

  traffic: `Você é um estrategista sênior de tráfego pago (Meta Ads e Google Ads), atuando como consultor interno de uma agência de performance. Você atende os GESTORES DA AGÊNCIA, ajudando a:
- Diagnosticar campanhas com desempenho ruim (CPL alto, baixa conversão, fadiga de criativo, segmentação, verba mal distribuída).
- Estruturar contas e campanhas, testes A/B, escalonamento de verba (CBO/ABO).
- Sugerir ângulos de copy e criativo por nicho de cliente.
- Interpretar métricas (CTR, CPM, CPC, CPL, ROAS, frequência) e recomendar próximos passos.

Você tem acesso a ferramentas (listar_clientes, detalhes_cliente) pra consultar os dados REAIS de um cliente da agência (status, plano, pagamentos, tarefas em aberto, contas de anúncio vinculadas) — use-as sempre que o gestor mencionar um cliente pelo nome ou pedir uma visão da carteira, em vez de pedir pra ele descrever tudo de novo. Nunca invente números que poderiam vir dessas ferramentas.

Responda sempre em português do Brasil, técnico, objetivo e acionável. Peça os dados que faltarem, mas sempre ofereça hipóteses mesmo com informação parcial.`,

  client_marketing: `Você é um consultor de marketing digital que atende DIRETAMENTE o cliente final de uma agência de tráfego pago — em geral psicólogos, terapeutas e outros profissionais liberais de saúde/bem-estar que contrataram a agência para gerir seus anúncios. Fale diretamente com esse profissional, em segunda pessoa, como um consultor de confiança — não como se estivesse relatando para a agência.

Você ajuda esse profissional a:
- Estruturar e melhorar a presença no Instagram e outras redes: bio, destaques, grade, frequência de postagem, tipos de conteúdo que geram autoridade e confiança.
- Gerar ideias e roteiros de conteúdo (posts, reels, stories) alinhados à abordagem/diferencial dele.
- Escrever scripts de atendimento/vendas para conversar com quem chega pelo anúncio (WhatsApp, DM, ligação).
- Pensar em pacotes/ofertas e posicionamento de preço, considerando o nível de autoridade que ele já tem e sua capacidade de conversão (venda).
- Tirar dúvidas gerais de marketing digital — o que funciona, o que evitar, como interpretar resultados em termos simples (sem jargão técnico de gestor de tráfego).
- Lembrar, quando fizer sentido, das obrigações éticas do CFP/CRP (sem alegar cura, sem expor pacientes, sem sensacionalismo).

Sazonalidade e datas relevantes para content ideas: ${AWARENESS_DATES_REFERENCE}

Responda sempre em português do Brasil, em tom próximo e prático — como um consultor experiente que quer genuinamente ajudar esse profissional a crescer, sem jargão técnico desnecessário.`,
};

function notConfiguredError() {
  const err = new Error(
    "Assistente de IA ainda não configurado. Peça ao sócio para adicionar a variável ANTHROPIC_API_KEY nas variáveis de ambiente do backend (Railway)."
  );
  err.notConfigured = true;
  return err;
}

// Chamada crua à API da Anthropic — devolve a resposta inteira (não só o
// texto), porque o loop de ferramentas (runWithTools, abaixo) precisa
// inspecionar stop_reason e os content blocks de tool_use.
async function callClaude({ system, messages, tools, maxTokens = 1200 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw notConfiguredError();
  const body = { model: MODEL, max_tokens: maxTokens, system, messages };
  if (tools && tools.length) body.tools = tools;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(data?.error?.message || "Erro ao consultar a IA.");
  }
  return data;
}

async function callClaudeRaw({ system, messages, maxTokens = 1200 }) {
  const data = await callClaude({ system, messages, maxTokens });
  return (data?.content || []).map((c) => c.text || "").join("");
}

// Ferramentas que os assistentes internos (Estratégia de Tráfego, Nicho
// Terapia) podem chamar pra consultar dados REAIS do sistema em vez de só
// responder com o que foi digitado na conversa — ex: "como está o cliente
// X" já busca status/pagamentos/tarefas de verdade, em vez de a IA ter que
// adivinhar ou pedir pro gestor copiar e colar tudo manualmente.
const STAFF_TOOLS = [
  {
    name: "listar_clientes",
    description:
      "Lista os clientes da agência visíveis para o usuário atual (nome, status, plano, nicho, mensalidade, gestor responsável). Use quando o usuário perguntar de forma geral sobre \"meus clientes\"/\"a carteira\", pedir uma visão geral, ou não souber o nome exato do cliente que quer consultar.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "detalhes_cliente",
    description:
      "Busca os dados reais de UM cliente específico da agência pelo nome: status, plano, valor mensal, verba diária, criativo ativo, dia de otimização, últimos pagamentos, tarefas em aberto e contas de anúncio vinculadas. Use sempre que o usuário mencionar um cliente pelo nome e a resposta depender de números/dados reais — nunca invente esses dados.",
    input_schema: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome (ou parte do nome) do cliente a buscar." } },
      required: ["nome"],
      additionalProperties: false,
    },
  },
];

async function toolListarClientes(req) {
  const where = req.user.role === "GESTOR" ? { gestorId: req.user.id } : {};
  const clients = await prisma.client.findMany({
    where,
    select: { name: true, status: true, plan: true, niche: true, monthlyValue: true, planType: true, gestor: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  if (clients.length === 0) return { clientes: [], aviso: "Nenhum cliente encontrado." };
  return {
    clientes: clients.map((c) => ({
      nome: c.name,
      status: c.status,
      plano: c.plan,
      tipoPlano: c.planType,
      nicho: c.niche,
      mensalidade: c.monthlyValue,
      gestor: c.gestor?.name || null,
    })),
  };
}

async function toolDetalhesCliente(req, input) {
  const nome = (input?.nome || "").trim();
  if (!nome) return { erro: "Informe o nome do cliente." };
  const where = {
    name: { contains: nome, mode: "insensitive" },
    ...(req.user.role === "GESTOR" ? { gestorId: req.user.id } : {}),
  };
  const client = await prisma.client.findFirst({
    where,
    include: {
      payments: { orderBy: { dueDate: "desc" }, take: 5 },
      tasks: { where: { status: { not: "CONCLUIDA" } }, orderBy: { dueDate: "asc" }, take: 8 },
      adAccounts: true,
      gestor: { select: { name: true } },
    },
  });
  if (!client) return { erro: `Nenhum cliente chamado "${nome}" encontrado (ou sem acesso a ele).` };
  return {
    nome: client.name,
    nicho: client.niche,
    status: client.status,
    plano: client.plan,
    tipoPlano: client.planType,
    mensalidade: client.monthlyValue,
    verbaDiariaAnuncio: client.dailyAdBudget,
    criativoAtivo: client.activeCreative,
    diaOtimizacaoSemana: client.optimizationDay,
    proximaOtimizacao: client.nextOptimizationDate,
    ultimaOtimizacao: client.lastOptimizedAt,
    gestorResponsavel: client.gestor?.name || null,
    pagamentosRecentes: client.payments.map((p) => ({ valor: p.amount, vencimento: p.dueDate, status: p.status })),
    tarefasEmAberto: client.tasks.map((t) => ({ titulo: t.title, prazo: t.dueDate, prioridade: t.priority })),
    contasDeAnuncioVinculadas: client.adAccounts.map((a) => ({ nome: a.name, moeda: a.currency, status: a.accountStatus })),
  };
}

const STAFF_TOOL_HANDLERS = {
  listar_clientes: (req) => toolListarClientes(req),
  detalhes_cliente: (req, input) => toolDetalhesCliente(req, input),
};

// Modos que podem consultar dados reais do sistema — só os assistentes
// internos (sócio/gestor). O assistente do cliente final (client_marketing)
// fica de fora de propósito: dar a ele "listar_clientes" abriria a carteira
// inteira da agência pra um login de cliente.
const MODES_WITH_TOOLS = new Set(["traffic", "therapy"]);
const MAX_TOOL_ROUNDS = 4;

// Roda o loop de tool-use "na mão" (sem SDK, só fetch): manda a conversa +
// as ferramentas disponíveis; se a IA pedir pra usar uma ferramenta
// (stop_reason "tool_use"), executa a função correspondente já filtrada
// pelo usuário logado (req.user), devolve o resultado pra IA como
// tool_result, e repete — até a IA responder com texto final ou até o
// limite de rodadas (evita loop infinito custando tokens à toa).
async function runWithTools({ req, system, messages, tools, handlers, maxTokens }) {
  const convo = messages.slice();
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callClaude({ system, messages: convo, tools, maxTokens });
    const content = data.content || [];
    if (data.stop_reason !== "tool_use") {
      return content.map((c) => c.text || "").join("");
    }
    convo.push({ role: "assistant", content });
    const toolResults = [];
    for (const block of content) {
      if (block.type !== "tool_use") continue;
      const handler = handlers[block.name];
      let result;
      try {
        result = handler ? await handler(req, block.input || {}) : { erro: "Ferramenta desconhecida." };
      } catch (err) {
        result = { erro: err.message || "Erro ao consultar os dados." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    convo.push({ role: "user", content: toolResults });
  }
  // Esgotou as rodadas sem uma resposta final — força uma última chamada
  // sem ferramentas, só pra garantir que algo seja respondido ao usuário.
  const data = await callClaude({ system, messages: convo, maxTokens });
  return (data.content || []).map((c) => c.text || "").join("");
}

const MAX_HISTORY_MESSAGES = 40;

function safeParseContent(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Monta o array de mensagens pra mandar pra API a partir do histórico
// salvo no banco. Turnos antigos que tinham anexo (content é um array de
// blocks, não string) são trocados por um resumo curto — sem isso, uma
// conversa longa reenviaria a mesma imagem/planilha em base64 em TODA
// chamada seguinte, inflando custo e tokens sem necessidade.
function buildApiMessages(rows) {
  return rows.map((row, i) => {
    const isLast = i === rows.length - 1;
    const parsed = safeParseContent(row.content);
    if (!isLast && Array.isArray(parsed)) {
      return { role: row.role, content: row.displayText || "[anexo enviado anteriormente]" };
    }
    return { role: row.role, content: parsed };
  });
}

async function findClientForUser(req, clientId) {
  if (!clientId) return null;
  if (req.user.role === "SOCIO") return prisma.client.findUnique({ where: { id: clientId } });
  if (req.user.role === "GESTOR") return prisma.client.findFirst({ where: { id: clientId, gestorId: req.user.id } });
  if (req.user.role === "CLIENTE") {
    if (req.user.clientId !== clientId) return null;
    return prisma.client.findUnique({ where: { id: clientId } });
  }
  return null;
}

// Devolve o histórico salvo de um assistente (só o texto de exibição, não
// o content bruto que vai pra API) — carregado quando a tela do assistente
// abre, pra conversa continuar de onde parou em vez de começar vazia.
router.get("/history", async (req, res) => {
  const mode = req.query.mode;
  let finalMode = mode;
  if (req.user.role === "CLIENTE") finalMode = "client_marketing";
  else if (!SYSTEM_PROMPTS[finalMode]) finalMode = "traffic";

  // desc + take pega as N mais RECENTES (não as mais antigas) — depois
  // volta pra ordem cronológica pra exibir/mandar pra API certinho.
  const rows = await prisma.aiMessage.findMany({
    where: { userId: req.user.id, assistantKey: finalMode },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
    select: { id: true, role: true, displayText: true, content: true, createdAt: true },
  });
  rows.reverse();
  res.json({
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      displayText: r.displayText ?? (typeof safeParseContent(r.content) === "string" ? safeParseContent(r.content) : "📎 anexo"),
    })),
  });
});

router.delete("/history", async (req, res) => {
  const mode = req.query.mode;
  let finalMode = mode;
  if (req.user.role === "CLIENTE") finalMode = "client_marketing";
  else if (!SYSTEM_PROMPTS[finalMode]) finalMode = "traffic";
  await prisma.aiMessage.deleteMany({ where: { userId: req.user.id, assistantKey: finalMode } });
  res.status(204).end();
});

router.post("/chat", async (req, res) => {
  const { mode, message, displayText } = req.body || {};
  const hasContent = typeof message === "string" ? message.trim().length > 0 : Array.isArray(message) && message.length > 0;
  if (!hasContent) {
    return res.status(400).json({ error: "Escreva uma mensagem." });
  }

  let finalMode = mode;
  if (req.user.role === "CLIENTE") {
    finalMode = "client_marketing"; // clients can only ever use their own assistant
  } else if (!SYSTEM_PROMPTS[finalMode]) {
    finalMode = "traffic";
  }

  const system = SYSTEM_PROMPTS[finalMode];
  try {
    // Carrega o histórico salvo desse usuário+assistente, monta a conversa
    // completa (histórico + a mensagem nova) e já salva a mensagem do
    // usuário — mesmo que a chamada à IA falhe depois, o que a pessoa
    // escreveu não se perde.
    const priorRows = await prisma.aiMessage.findMany({
      where: { userId: req.user.id, assistantKey: finalMode },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true, displayText: true },
    });
    priorRows.reverse(); // desc+take pega as mais recentes; volta pra ordem cronológica antes de montar a conversa
    const userDisplayText = displayText ?? (typeof message === "string" ? message : "📎 anexo");
    await prisma.aiMessage.create({
      data: {
        userId: req.user.id,
        assistantKey: finalMode,
        role: "user",
        content: JSON.stringify(message),
        displayText: userDisplayText,
      },
    });

    const apiMessages = buildApiMessages([...priorRows, { role: "user", content: JSON.stringify(message), displayText: userDisplayText }]);

    const useTools = MODES_WITH_TOOLS.has(finalMode);
    const text = useTools
      ? await runWithTools({ req, system, messages: apiMessages, tools: STAFF_TOOLS, handlers: STAFF_TOOL_HANDLERS, maxTokens: 1400 })
      : await callClaudeRaw({ system, messages: apiMessages, maxTokens: 1400 });

    await prisma.aiMessage.create({
      data: { userId: req.user.id, assistantKey: finalMode, role: "assistant", content: JSON.stringify(text), displayText: text },
    });

    res.json({ text });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

router.post("/script", async (req, res) => {
  const { clientId, tone } = req.body || {};
  if (!clientId) return res.status(400).json({ error: "Informe o cliente." });

  const client = await findClientForUser(req, clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado ou sem acesso." });

  const system =
    "Você é um copywriter especialista em scripts de vendas e atendimento para agências de tráfego pago e para os negócios dos clientes finais delas. Escreva em português do Brasil, direto ao ponto, com linguagem natural de conversa (WhatsApp ou ligação), sem soar robótico ou genérico.";
  const userMsg = `Escreva um script de vendas/atendimento para o negócio "${client.name}"${
    client.niche ? `, do nicho ${client.niche}` : ""
  }. Tom desejado: ${tone || "consultivo e confiante"}. O script deve cobrir, em seções curtas: abertura, levantamento de necessidade, apresentação da oferta (considere o plano "${
    client.plan || "não informado"
  }"), quebra das objeções mais comuns desse nicho, e fechamento com uma chamada para ação clara.`;

  try {
    const text = await callClaudeRaw({ system, messages: [{ role: "user", content: userMsg }] });
    res.json({ text });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

// Reviews an Instagram profile from what the user tells us + optional
// screenshots (no scraping — Instagram's API doesn't allow that without an
// approved app, so this works from what the client/staff member supplies).
router.post("/instagram-analysis", async (req, res) => {
  const { clientId, handle, followers, bio, niche, approach, extraNotes, images } = req.body || {};

  let client = null;
  if (clientId) {
    client = await findClientForUser(req, clientId);
    if (!client) return res.status(404).json({ error: "Cliente não encontrado ou sem acesso." });
  }

  const imgList = Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [];
  for (const img of imgList) {
    if (!img?.dataBase64 || img.dataBase64.length > MAX_IMAGE_B64_CHARS) {
      return res.status(413).json({ error: "Uma das imagens é grande demais. Envie prints menores (~4MB cada, no máximo 3)." });
    }
  }

  const system = `Você é um consultor de social media e branding pessoal, especializado em ajudar profissionais de saúde/bem-estar (principalmente psicólogos e terapeutas) a estruturar um Instagram que gera autoridade e conversa com quem chega via anúncios pagos.

Analise as informações e (se enviadas) as imagens do perfil/posts fornecidas, e responda em português do Brasil com estas seções, em texto corrido bem organizado (use títulos curtos em negrito estilo "**Título**", não use JSON):

1. **Diagnóstico geral** — pontos fortes e pontos fracos do perfil hoje.
2. **O que melhorar** — sugestões práticas e específicas: bio, destaques, grade/estética, frequência e tipos de conteúdo, prova social, chamada para ação, linkin.bio, etc.
3. **Autoridade e poder de venda** — avalie o quanto o perfil hoje transmite autoridade no nicho e o quanto parece converter seguidores em contatos/vendas (com base no que foi descrito/mostrado).
4. **Sugestão de pacote de tráfego** — considerando a maturidade do perfil, a autoridade percebida e a capacidade de conversão observada, recomende se esse profissional está pronto para um investimento mais agressivo em anúncios, ou se primeiro vale reforçar a base orgânica (autoridade/prova social) antes de escalar verba — e por quê. Seja direto e prático.

Nunca invente dados que não foram informados; se faltar informação relevante, diga o que mais ajudaria a analisar melhor. Lembre, quando fizer sentido, das obrigações éticas do CFP/CRP (sem alegar cura, sem expor pacientes).`;

  const contextLines = [
    handle ? `Instagram: @${String(handle).replace(/^@/, "")}` : null,
    followers ? `Seguidores aproximados: ${followers}` : null,
    (niche || client?.niche) ? `Nicho/especialidade: ${niche || client.niche}` : null,
    approach ? `Abordagem/diferencial do atendimento: ${approach}` : null,
    bio ? `Bio atual:\n${bio}` : null,
    extraNotes ? `Observações adicionais: ${extraNotes}` : null,
  ].filter(Boolean);

  if (contextLines.length === 0 && imgList.length === 0) {
    return res.status(400).json({ error: "Informe ao menos o @ do Instagram, a bio, ou envie um print para eu poder analisar." });
  }

  const content = [{ type: "text", text: contextLines.join("\n\n") || "Analise os prints enviados." }];
  for (const img of imgList) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mimeType || "image/png", data: img.dataBase64 } });
  }

  try {
    const text = await callClaudeRaw({ system, messages: [{ role: "user", content }], maxTokens: 1500 });
    res.json({ text });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

// Generates a batch of content-calendar ideas for a given month, aware of
// Brazilian awareness dates/holidays, tailored to the client's approach.
router.post("/content-plan", async (req, res) => {
  const { clientId, month, approach, notes } = req.body || {};
  if (!month) return res.status(400).json({ error: "Informe o mês (AAAA-MM)." });

  let client = null;
  if (clientId) {
    client = await findClientForUser(req, clientId);
    if (!client) return res.status(404).json({ error: "Cliente não encontrado ou sem acesso." });
  }

  const system = `Você é um planejador de conteúdo para redes sociais de profissionais de saúde/bem-estar (foco em psicólogos/terapeutas, mas adapte ao nicho informado). Gere um plano de conteúdo para o mês pedido.

${AWARENESS_DATES_REFERENCE}

Responda ESTRITAMENTE com um JSON válido, sem markdown, sem texto antes ou depois, no formato:
{"ideas":[{"date":"AAAA-MM-DD","title":"...","theme":"...","caption_outline":"..."}]}

Gere entre 6 e 10 ideias distribuídas ao longo do mês (datas dentro do mês pedido), priorizando datas comemorativas/sazonais relevantes ao nicho quando existirem no mês, e preenchendo o restante com pilares de conteúdo variados (educativo, autoridade, bastidores, prova social, chamada para ação). "caption_outline" deve ser um roteiro curto (2-3 frases) do que falar no post, não a legenda pronta inteira.`;

  const userMsg = [
    `Mês: ${month}`,
    (client?.niche) ? `Nicho: ${client.niche}` : null,
    approach ? `Abordagem/diferencial do atendimento: ${approach}` : null,
    notes ? `Observações: ${notes}` : null,
  ].filter(Boolean).join("\n");

  try {
    const raw = await callClaudeRaw({ system, messages: [{ role: "user", content: userMsg }], maxTokens: 2000 });
    let parsed = null;
    try {
      const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      parsed = null;
    }
    if (parsed && Array.isArray(parsed.ideas)) {
      res.json({ ideas: parsed.ideas });
    } else {
      res.json({ ideas: [], raw });
    }
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

// Extrai o conteúdo de uma planilha exportada do Gerenciador de Anúncios
// (Meta Ads) em .xlsx/.xls — devolve como texto tipo CSV pra anexar na
// conversa com a IA. CSV puro não precisa passar por aqui: o navegador já
// lê o texto direto (não precisa de xlsx pra isso).
router.post("/extract-spreadsheet", async (req, res) => {
  const { fileName, dataBase64 } = req.body || {};
  if (!dataBase64) return res.status(400).json({ error: "Envie o arquivo." });
  if (dataBase64.length > MAX_SPREADSHEET_B64_CHARS) {
    return res.status(413).json({ error: "Arquivo grande demais — exporte um período menor da campanha." });
  }
  try {
    const buffer = Buffer.from(dataBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parts = [];
    // Cobre até as 3 primeiras abas (o Gerenciador de Anúncios às vezes
    // exporta "Dashboard" + abas por nível — campanha/conjunto/anúncio).
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      if (csv.trim()) parts.push(`--- Aba: ${sheetName} ---\n${csv.trim()}`);
    }
    let text = parts.join("\n\n");
    let truncated = false;
    if (text.length > MAX_EXTRACTED_CHARS) {
      text = text.slice(0, MAX_EXTRACTED_CHARS);
      truncated = true;
    }
    if (!text.trim()) {
      return res.status(400).json({ error: "Não consegui ler dados nessa planilha — confira se o arquivo não está vazio ou corrompido." });
    }
    res.json({ text, truncated, sheets: workbook.SheetNames.length });
  } catch (err) {
    res.status(400).json({ error: "Não consegui abrir esse arquivo. Confira se é um .xlsx/.xls válido exportado do Gerenciador de Anúncios." });
  }
});

// Geração de imagens com IA (OpenAI) — recurso à parte do chat, restrito a
// sócio/gestor: usa uma chave separada (OPENAI_API_KEY, com custo por
// imagem gerada na conta OpenAI de quem configurou), então fica de fora do
// fluxo de chat/cliente por completo — o requireRole aqui é reforço mesmo
// sabendo que hoje só sócio/gestor enxergam essa tela no frontend.
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const ALLOWED_IMAGE_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);

router.post("/generate-image", requireRole("SOCIO", "GESTOR"), async (req, res) => {
  const { prompt, size } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: "Descreva a imagem que você quer gerar." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: "Gerador de imagens ainda não configurado. Peça ao sócio para adicionar a variável OPENAI_API_KEY nas variáveis de ambiente do backend (Railway).",
    });
  }
  const finalSize = ALLOWED_IMAGE_SIZES.has(size) ? size : "1024x1024";

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt: String(prompt).trim(), size: finalSize, n: 1 }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(data?.error?.message || "Erro ao gerar a imagem.");
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("A IA não retornou uma imagem — tente descrever de outro jeito.");
    res.json({ imageBase64: b64 });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
