const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("SOCIO", "GESTOR"));

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPTS = {
  therapy: `Você é um estrategista de marketing digital especializado em captação de pacientes para psicólogos, terapeutas, clínicas de psicoterapia e consultórios de saúde mental via tráfego pago (Meta Ads e Google Ads).

Você conhece a fundo as particularidades do nicho:
- Restrições de anúncio: Meta e Google têm políticas rígidas para conteúdo de saúde/categoria especial; oriente sobre como criar anúncios aprovados evitando alegações de "cura", promessas de resultado, ou linguagem que target diretamente uma condição de saúde (o algoritmo do Meta já restringe personalização para esses anúncios).
- Público: geralmente pessoas em momento de dor/vulnerabilidade — a comunicação precisa ser acolhedora, ética e nunca sensacionalista ou alarmista.
- Funil típico: anúncio → página de captura ou perfil no Instagram → conversa no WhatsApp → sessão de avaliação → paciente recorrente. CPL costuma ser mais alto que em nichos comerciais; o que importa é a taxa de comparecimento e a recorrência (LTV do paciente ao longo do tratamento).
- Copy que funciona: validação do sentimento do público ("é normal se sentir assim"), autoridade (CRP, especialização, abordagem terapêutica), prova social discreta (sem expor pacientes), convite de baixo atrito ("agende uma conversa inicial sem compromisso").
- Compliance: sempre lembrar que o profissional deve seguir o código de ética do CFP/CRP e não fazer promessas terapêuticas.
- Sazonalidade: picos de busca por terapia em janeiro (metas de ano novo), Setembro Amarelo, e após períodos de crise coletiva.

Responda sempre em português do Brasil, de forma prática e direta, com sugestões acionáveis (estrutura de campanha, ideias de criativo, ângulos de copy, segmentação, ou diagnóstico do que pode estar dando errado). Quando fizer sentido, traga exemplos concretos de headline/copy.`,

  traffic: `Você é um estrategista sênior de tráfego pago (Meta Ads e Google Ads), atuando como consultor interno de uma agência de performance. Você ajuda os gestores de tráfego da agência a:
- Diagnosticar campanhas com desempenho ruim (CPL alto, baixa conversão, fadiga de criativo, problema de segmentação, verba mal distribuída no funil).
- Estruturar contas e campanhas (estrutura de funil, testes A/B de criativo, escalonamento de verba — horizontal vs vertical, uso de CBO/ABO).
- Sugerir ângulos de copy e criativo por nicho de cliente.
- Interpretar métricas (CTR, CPM, CPC, CPL, ROAS, frequência) e recomendar próximos passos.
- Orientar sobre pixel, eventos de conversão, e boas práticas de otimização.

Responda sempre em português do Brasil, com respostas técnicas, objetivas e acionáveis — como um gestor de tráfego experiente conversando com outro gestor da mesma agência. Peça os dados que faltarem (verba, CPL atual, nicho, etapa do funil) antes de dar um diagnóstico definitivo, mas sempre ofereça hipóteses e próximos passos mesmo com informação parcial.`,
};

async function callClaude(system, messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "Assistente de IA ainda não configurado. Peça ao sócio para adicionar a variável ANTHROPIC_API_KEY nas variáveis de ambiente do backend (Railway)."
    );
    err.notConfigured = true;
    throw err;
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(data?.error?.message || "Erro ao consultar a IA.");
  }
  return (data?.content || []).map((c) => c.text || "").join("");
}

router.post("/chat", async (req, res) => {
  const { mode, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Envie ao menos uma mensagem." });
  }
  const system = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.traffic;
  try {
    const text = await callClaude(system, messages);
    res.json({ text });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

router.post("/script", async (req, res) => {
  const { clientId, tone } = req.body || {};
  if (!clientId) return res.status(400).json({ error: "Informe o cliente." });

  const client =
    req.user.role === "SOCIO"
      ? await prisma.client.findUnique({ where: { id: clientId } })
      : await prisma.client.findFirst({ where: { id: clientId, gestorId: req.user.id } });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado ou sem acesso." });

  const system =
    "Você é um copywriter especialista em scripts de vendas e atendimento para agências de tráfego pago e para os negócios dos clientes finais delas. Escreva em português do Brasil, direto ao ponto, com linguagem natural de conversa (WhatsApp ou ligação), sem soar robótico ou genérico.";
  const userMsg = `Escreva um script de vendas/atendimento para o negócio "${client.name}"${
    client.niche ? `, do nicho ${client.niche}` : ""
  }. Tom desejado: ${tone || "consultivo e confiante"}. O script deve cobrir, em seções curtas: abertura, levantamento de necessidade, apresentação da oferta (considere o plano "${
    client.plan || "não informado"
  }"), quebra das objeções mais comuns desse nicho, e fechamento com uma chamada para ação clara.`;

  try {
    const text = await callClaude(system, [{ role: "user", content: userMsg }]);
    res.json({ text });
  } catch (err) {
    res.status(err.notConfigured ? 501 : 502).json({ error: err.message });
  }
});

module.exports = router;
