// Helpers compartilhados pelas telas do módulo Administração
// (components/administracao/*) — evita repetir currency()/fmtDate() em
// cada arquivo, já que aqui são bem mais telas do que o padrão anterior.

export function currency(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function currencyCompact(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function fmtMonthLabel(key) {
  // "2026-09" -> "set/26"
  if (!key) return "—";
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
}

export const ADMIN_STATUS_LABEL = {
  PREVISTO: "Previsto",
  PENDENTE: "Pendente",
  PAGO: "Pago",
  ATRASADO: "Atrasado",
  CANCELADO: "Cancelado",
};

export const ADMIN_STATUS_CLASS = {
  PREVISTO: "bg-white/5 text-inksoft",
  PENDENTE: "bg-warningsoft text-warning",
  PAGO: "bg-successsoft text-success",
  ATRASADO: "bg-dangersoft text-danger",
  CANCELADO: "bg-white/5 text-inkfaint line-through",
};

export function AdminStatusPill({ status }) {
  return (
    <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${ADMIN_STATUS_CLASS[status] || "bg-white/5 text-inksoft"}`}>
      {ADMIN_STATUS_LABEL[status] || status}
    </span>
  );
}

export const REVENUE_CATEGORY_OPTIONS = [
  "Mensalidade cliente",
  "Serviço avulso",
  "Consultoria",
  "Comissão recebida",
  "Outros",
];

export const EXPENSE_CATEGORY_OPTIONS = [
  "Funcionários",
  "Prestadores",
  "Softwares",
  "Marketing",
  "Impostos",
  "Contabilidade",
  "Infraestrutura",
  "Internet",
  "Telefonia",
  "Design",
  "Ferramentas",
  "Anúncios da própria agência",
  "Comissões",
  "Pró-labore",
  "Administrativo",
  "Outros",
];

export const PAYMENT_METHOD_OPTIONS = ["Pix", "Boleto", "Cartão", "Transferência", "Dinheiro", "Outro"];

// --- Fase 2 (Contratos, Equipe, Ferramentas, Fornecedores) ---------------

export const CONTRACT_TYPE_OPTIONS = [
  { value: "CLIENTE", label: "Cliente" },
  { value: "FUNCIONARIO", label: "Funcionário" },
  { value: "PRESTADOR", label: "Prestador" },
  { value: "FORNECEDOR", label: "Fornecedor" },
];

export const CONTRACT_STATUS_LABEL = { ATIVO: "Ativo", ENCERRADO: "Encerrado", CANCELADO: "Cancelado" };
export const CONTRACT_STATUS_CLASS = {
  ATIVO: "bg-successsoft text-success",
  ENCERRADO: "bg-white/5 text-inksoft",
  CANCELADO: "bg-white/5 text-inkfaint line-through",
};

export const EMPLOYEE_TYPE_OPTIONS = [
  { value: "CLT", label: "CLT" },
  { value: "PJ", label: "PJ" },
  { value: "PRESTADOR", label: "Prestador" },
];

export const EMPLOYEE_STATUS_LABEL = { ATIVO: "Ativo", INATIVO: "Inativo", DESLIGADO: "Desligado" };

export const TOOL_CATEGORY_OPTIONS = [
  "Software/SaaS",
  "Design",
  "Anúncios",
  "Hospedagem",
  "Comunicação",
  "IA",
  "Outros",
];

// --- Fase 3 (Pró-labore, Distribuição, Reserva, Metas, Reunião, Auditoria) ---

export const GOAL_TYPE_OPTIONS = [
  { value: "RECEITA", label: "Receita" },
  { value: "DESPESA", label: "Despesa" },
  { value: "LUCRO", label: "Lucro" },
  { value: "OUTRO", label: "Outro" },
];

export const GOAL_STATUS_LABEL = { EM_ANDAMENTO: "Em andamento", ATINGIDA: "Atingida", NAO_ATINGIDA: "Não atingida" };
export const GOAL_STATUS_CLASS = {
  EM_ANDAMENTO: "bg-warningsoft text-warning",
  ATINGIDA: "bg-successsoft text-success",
  NAO_ATINGIDA: "bg-dangersoft text-danger",
};

export const DECISION_STATUS_LABEL = { ABERTA: "Aberta", CONCLUIDA: "Concluída" };

// --- Fase 4 (Documentos, Processos, Aprovações, Centros de custo, Contas
// bancárias, Busca global, Permissões) — 08/09/2026 ---

export const DOCUMENT_CATEGORY_OPTIONS = [
  "Contratos",
  "Notas fiscais",
  "Fiscal/Contábil",
  "Jurídico",
  "Marca/Identidade visual",
  "Modelos/Templates",
  "Outros",
];

export const PROCESS_TYPE_OPTIONS = [
  { value: "CLIENTE_ONBOARDING", label: "Onboarding de cliente" },
  { value: "CLIENTE_OFFBOARDING", label: "Offboarding de cliente" },
  { value: "FUNCIONARIO_ONBOARDING", label: "Onboarding de funcionário" },
  { value: "FUNCIONARIO_OFFBOARDING", label: "Offboarding de funcionário" },
];
export const PROCESS_TYPE_LABEL = Object.fromEntries(PROCESS_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export const APPROVAL_STATUS_LABEL = { PENDENTE: "Pendente", APROVADA: "Aprovada", RECUSADA: "Recusada" };
export const APPROVAL_STATUS_CLASS = {
  PENDENTE: "bg-warningsoft text-warning",
  APROVADA: "bg-successsoft text-success",
  RECUSADA: "bg-dangersoft text-danger",
};

export const PERMISSION_ACTION_LABEL = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  approve: "Aprovar",
  export: "Exportar",
};
