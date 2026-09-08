// Abas opcionais do portal do cliente (Client.portalFeatures) — mesmas keys
// do backend (backend/src/utils/portalFeatures.js). "geral" não entra aqui
// porque é sempre visível, não é um módulo que se liga/desliga.
export const PORTAL_FEATURE_OPTIONS = [
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

export const ALL_PORTAL_FEATURE_KEYS = PORTAL_FEATURE_OPTIONS.map((f) => f.key);

// Vazio ("nunca mexi nisso") = libera tudo, pra não regredir cliente já
// cadastrado. Só passa a restringir quando o sócio marca algo de propósito.
export function hasPortalFeature(client, key) {
  const list = client?.portalFeatures;
  if (!list || list.length === 0) return true;
  return list.includes(key);
}
