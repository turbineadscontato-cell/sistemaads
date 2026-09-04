// Catálogo de serviços que a agência presta — mesmas keys do backend
// (backend/src/utils/services.js). Usado no cadastro de cliente (múltipla
// escolha) e para calcular quanto o gestor tem a receber.
export const SERVICE_OPTIONS = [
  { key: "SOCIAL_MIDIA", label: "Social mídia" },
  { key: "TRAFEGO_PAGO", label: "Tráfego pago" },
  { key: "LANDING_PAGE", label: "Landing page por fora" },
  { key: "CURSO_VENDAS", label: "Curso de vendas" },
  { key: "MENTORIA", label: "Mentoria" },
  { key: "OUTRO", label: "Outro" },
];

export const SERVICE_LABEL = Object.fromEntries(SERVICE_OPTIONS.map((s) => [s.key, s.label]));

export const COMMISSION_PER_SERVICE = 50;
