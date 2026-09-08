// Abas opcionais do portal do cliente que o sócio pode ligar/desligar por
// cliente (Client.portalFeatures) — "geral" (visão geral) não entra aqui
// porque é sempre visível, não é um módulo. "leads" (CRM) é o único
// marcado como recomendado: é o módulo que "todo cliente" deveria ter,
// mas continua sendo uma escolha do sócio, não travado no código.
// Mantido em sincronia com frontend/lib/portalFeatures.js (mesmas keys).
const PORTAL_FEATURE_OPTIONS = [
  { key: "leads", label: "CRM (meus leads)", recommended: true },
  { key: "ia", label: "IA de Marketing (personalizada)" },
  { key: "pacientes", label: "Pacientes" },
  { key: "financeiro", label: "Financeiro de pacientes" },
  { key: "acessos", label: "Acessos dos pacientes" },
  { key: "conteudo", label: "Calendário de conteúdo" },
  { key: "arquivos", label: "Arquivos" },
  { key: "relatorios", label: "Relatórios (tráfego pago)" },
  { key: "marca", label: "Marca (white-label)" },
];

const VALID_PORTAL_FEATURE_KEYS = PORTAL_FEATURE_OPTIONS.map((f) => f.key);

function sanitizePortalFeatures(features) {
  if (!Array.isArray(features)) return [];
  return [...new Set(features.filter((f) => VALID_PORTAL_FEATURE_KEYS.includes(f)))];
}

module.exports = { PORTAL_FEATURE_OPTIONS, VALID_PORTAL_FEATURE_KEYS, sanitizePortalFeatures };
