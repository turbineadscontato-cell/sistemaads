const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
// Staff (sócio/gestor) AND clients (portal) use this router — access per
// mode/route is checked inside each handler, since a client may only reach
// their own "client_marketing" tools, never the internal staff assistants.
router.use(requireRole("SOCIO", "GESTOR", "CLIENTE"));

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const MAX_IMAGES = 3;
const MAX_IMAGE_B64_CHARS = 6_000_000; // ~4.5MB decoded, well under the API's per-image limit

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

Responda sempre em português do Brasil, de forma prática e direta, com sugestões acionáveis. Quando fizer sentido, traga exemplos concretos de headline/copy.`,

  traffic: `Você é um estrategista sênior de tráfego pago (Meta Ads e Google Ads), atuando como consultor interno de uma agência de performance. Você atende os GESTORES DA AGÊNCIA, ajudando a:
- Diagnosticar campanhas com desempenho ruim (CPL alto, baixa conversão, fadiga de criativo, segmentação, verba mal distribuída).
- Estruturar contas e campanhas, testes A/B, escalonamento de verba (CBO/ABO).
- Sugerir ângulos de copy e criativo por nicho de cliente.
- Interpretar métricas (CTR, CPM, CPC, CPL, ROAS, frequência) e recomendar próximos passos.

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

async function callClaudeRaw({ system, messages, maxTokens = 1200 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw notConfiguredError();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(data?.error?.message || "Erro ao consultar a IA.");
  }
  return (data?.content || []).map((c) => c.text || "").join("");
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

router.post("/chat", async (req, res) => {
  const { mode, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Envie ao menos uma mensagem." });
  }

  let finalMode = mode;
  if (req.user.role === "CLIENTE") {
    finalMode = "client_marketing"; // clients can only ever use their own assistant
  } else if (!SYSTEM_PROMPTS[finalMode]) {
    finalMode = "traffic";
  }

  const system = SYSTEM_PROMPTS[finalMode];
  try {
    const text = await callClaudeRaw({ system, messages });
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

module.exports = router;
