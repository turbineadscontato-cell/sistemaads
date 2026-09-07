"use client";

import { useState } from "react";
import AdminDashboard from "./AdminDashboard";
import AdminReceitas from "./AdminReceitas";
import AdminDespesas from "./AdminDespesas";
import AdminClientesFinanceiros from "./AdminClientesFinanceiros";
import AdminCobrancas from "./AdminCobrancas";
import AdminFluxoCaixa from "./AdminFluxoCaixa";
import AdminDRE from "./AdminDRE";
import AdminImpostos from "./AdminImpostos";
import AdminContratos from "./AdminContratos";
import AdminEquipe from "./AdminEquipe";
import AdminFolha from "./AdminFolha";
import AdminComissoes from "./AdminComissoes";
import AdminFerramentas from "./AdminFerramentas";
import AdminFornecedores from "./AdminFornecedores";

// Menu interno do módulo Administração (seção 43 do pedido) — agrupado por
// categoria visual, mas cada item é um componente próprio e independente.
// Fase 1 (07/09) trouxe Visão geral + o núcleo do Financeiro + Clientes
// financeiros. Fase 2 (07/09, segunda rodada) somou DRE/Impostos ao
// Financeiro e todo o grupo Empresa (Contratos/Equipe/Folha/Comissões/
// Ferramentas/Fornecedores). Sócios/Contábil completo (pró-labore,
// distribuição, reunião de sócios, auditoria) ficam pra fase 3 — ver plano
// do sistema pra ordem combinada.
const GROUPS = [
  { label: "Visão geral", items: [{ key: "dashboard", label: "Dashboard" }] },
  {
    label: "Financeiro",
    items: [
      { key: "receitas", label: "Receitas" },
      { key: "despesas", label: "Despesas" },
      { key: "cobrancas", label: "Cobranças" },
      { key: "fluxo", label: "Fluxo de caixa" },
      { key: "dre", label: "DRE" },
      { key: "impostos", label: "Impostos" },
    ],
  },
  {
    label: "Empresa",
    items: [
      { key: "clientes", label: "Clientes financeiros" },
      { key: "contratos", label: "Contratos" },
      { key: "equipe", label: "Equipe" },
      { key: "folha", label: "Folha" },
      { key: "comissoes", label: "Comissões" },
      { key: "ferramentas", label: "Ferramentas" },
      { key: "fornecedores", label: "Fornecedores" },
    ],
  },
];

export default function AdministracaoPanel() {
  const [sub, setSub] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase tracking-wide text-inkfaint mr-0.5">{g.label}</span>
            {g.items.map((item) => (
              <button key={item.key} onClick={() => setSub(item.key)}
                className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  sub === item.key ? "bg-accent text-white" : "bg-surface border border-border text-inksoft hover:text-ink"
                }`}>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {sub === "dashboard" && <AdminDashboard />}
      {sub === "receitas" && <AdminReceitas />}
      {sub === "despesas" && <AdminDespesas />}
      {sub === "cobrancas" && <AdminCobrancas />}
      {sub === "fluxo" && <AdminFluxoCaixa />}
      {sub === "dre" && <AdminDRE />}
      {sub === "impostos" && <AdminImpostos />}
      {sub === "clientes" && <AdminClientesFinanceiros />}
      {sub === "contratos" && <AdminContratos />}
      {sub === "equipe" && <AdminEquipe />}
      {sub === "folha" && <AdminFolha />}
      {sub === "comissoes" && <AdminComissoes />}
      {sub === "ferramentas" && <AdminFerramentas />}
      {sub === "fornecedores" && <AdminFornecedores />}
    </div>
  );
}
