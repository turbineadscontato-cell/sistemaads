// Wrapper compartilhado da API da Anthropic — extraído de routes/ai.js
// (13/09/2026) pra outros módulos (ex: routes/aiSites.js, o construtor de
// sites com IA) poderem reaproveitar a mesma chamada crua em vez de duplicar
// fetch/headers/tratamento de erro. Comportamento idêntico ao que já existia.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

function notConfiguredError() {
  const err = new Error(
    "Assistente de IA ainda não configurado. Peça ao sócio para adicionar a variável ANTHROPIC_API_KEY nas variáveis de ambiente do backend (Railway)."
  );
  err.notConfigured = true;
  return err;
}

// Chamada crua à API da Anthropic — devolve a resposta inteira (não só o
// texto), porque o loop de ferramentas (runWithTools, em ai.js) precisa
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

module.exports = { MODEL, notConfiguredError, callClaude, callClaudeRaw };
