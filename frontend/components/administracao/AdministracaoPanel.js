"use client";

import { useState } from "react";
import AdminDashboard from "./AdminDashboard";
import AdminReceitas from "./AdminReceitas";
import AdminDespesas from "./AdminDespesas";
import AdminClientesFinanceiros from "./AdminClientesFinanceiros";
import AdminCobrancas from "./AdminCobrancas";
import AdminFluxoCaixa from "./AdminFluxoCaixa";

// Menu interno do módulo Administração (seção 43 do pedido) — agrupado por
// categoria visual, mas cada item é um componente próprio e independente.
// Fase 1 implementa Visão geral + o núcleo do Financeiro + Clientes
// financeiros; Empresa/Sócios/Contábil/Gestão (contratos, equipe, folha,
// pró-labore, impostos, relatórios etc.) ficam pras próximas fases — ver
// mensagem de entrega e o plano do sistema pra a ordem combinada.
const GROUPS = [
  { label: "Visão geral", items: [{ key: "dashboard", label: "Dashboard" }] },
  {
    label: "Financeiro",
    items: [
      { key: "receitas", label: "Receitas" },
      { key: "despesas", label: "Despesas" },
      { key: "cobrancas", label: "Cobranças" },
      { key: "fluxo", label: "Fluxo de caixa" },
    ],
  },
  { label: "Empresa", items: [{ key: "clientes", label: "Clientes financeiros" }] },
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
      {sub === "clientes" && <AdminClientesFinanceiros />}
    </div>
  );
}
