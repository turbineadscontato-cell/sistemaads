// Catálogo de serviços que a agência presta — usado no cadastro do cliente
// (múltipla escolha) e no cálculo de comissão do gestor (R$50 por serviço
// aceito). Mantido em sincronia com frontend/lib/services.js (mesmas keys).
const SERVICE_OPTIONS = [
  { key: "SOCIAL_MIDIA", label: "Social mídia" },
  { key: "TRAFEGO_PAGO", label: "Tráfego pago" },
  { key: "LANDING_PAGE", label: "Landing page por fora" },
  { key: "CURSO_VENDAS", label: "Curso de vendas" },
  { key: "MENTORIA", label: "Mentoria" },
  { key: "OUTRO", label: "Outro" },
];

const SERVICE_LABEL = Object.fromEntries(SERVICE_OPTIONS.map((s) => [s.key, s.label]));

// Comissão fixa por serviço aceito, paga ao gestor responsável pelo cliente.
const COMMISSION_PER_SERVICE = 50;

module.exports = { SERVICE_OPTIONS, SERVICE_LABEL, COMMISSION_PER_SERVICE };
