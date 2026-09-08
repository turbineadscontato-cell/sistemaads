"use client";

import { useState } from "react";
import { api } from "../../lib/api";
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
import AdminProLabore from "./AdminProLabore";
import AdminDistribuicaoLucros from "./AdminDistribuicaoLucros";
import AdminReservaFinanceira from "./AdminReservaFinanceira";
import AdminMetas from "./AdminMetas";
import AdminReunioes from "./AdminReunioes";
import AdminAuditoria from "./AdminAuditoria";
import AdminRelatorios from "./AdminRelatorios";
import AdminDocumentos from "./AdminDocumentos";
import AdminProcessos from "./AdminProcessos";
import AdminAprovacoes from "./AdminAprovacoes";
import AdminCentrosCusto from "./AdminCentrosCusto";
import AdminContasBancarias from "./AdminContasBancarias";
import AdminPermissoes from "./AdminPermissoes";

// Menu interno do módulo Administração (seção 43 do pedido) — agrupado por
// categoria visual, mas cada item é um componente próprio e independente.
// Fase 1 (07/09) trouxe Visão geral + o núcleo do Financeiro + Clientes
// financeiros. Fase 2 somou DRE/Impostos ao Financeiro e todo o grupo
// Empresa. Fase 3 somou Sócios (pró-labore, distribuição, reserva, reunião)
// e Gestão (metas, relatórios, auditoria). Fase 4 (08/09/2026) fechou os
// pontos que ficaram de fora do escopo original: Documentos/Processos/
// Aprovações (grupo novo "Operacional"), Centros de custo/Contas bancárias
// (em Empresa) e Permissões (em Gestão) — além da busca global abaixo.
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
      { key: "contas-bancarias", label: "Contas bancárias" },
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
      { key: "centros-custo", label: "Centros de custo" },
    ],
  },
  {
    label: "Operacional",
    items: [
      { key: "documentos", label: "Documentos" },
      { key: "processos", label: "Checklists" },
      { key: "aprovacoes", label: "Aprovações" },
    ],
  },
  {
    label: "Sócios",
    items: [
      { key: "prolabore", label: "Pró-labore" },
      { key: "distribuicao", label: "Distribuição de lucros" },
      { key: "reserva", label: "Reserva financeira" },
      { key: "reunioes", label: "Reunião de sócios" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { key: "metas", label: "Metas" },
      { key: "relatorios", label: "Relatórios" },
      { key: "auditoria", label: "Auditoria" },
      { key: "permissoes", label: "Permissões" },
    ],
  },
];

function BuscaGlobal({ onGoTo }) {
  const [q, setQ] = useState("");
  const [grupos, setGrupos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function buscar(value) {
    setQ(value);
    if (value.trim().length < 2) { setGrupos(null); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await api(`/api/admin/busca?q=${encodeURIComponent(value.trim())}`);
      setGrupos(res.grupos);
      setOpen(true);
    } catch (err) {
      setGrupos(null);
    } finally {
      setLoading(false);
    }
  }

  function escolher(area) {
    onGoTo(area);
    setOpen(false);
    setQ("");
    setGrupos(null);
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <input
        value={q}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => grupos && setOpen(true)}
        placeholder="Buscar em toda a Administração…"
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[12.5px] text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent"
      />
      {open && (
        <div className="absolute z-40 mt-1.5 w-full bg-surface border border-border rounded-xl shadow-2xl max-h-80 overflow-y-auto">
          {loading && <div className="px-3 py-3 text-[12px] text-inkfaint">Buscando…</div>}
          {!loading && grupos && grupos.length === 0 && <div className="px-3 py-3 text-[12px] text-inkfaint">Nada encontrado pra "{q}".</div>}
          {!loading && grupos && grupos.map((g) => (
            <div key={g.area} className="py-1.5 border-b border-border last:border-0">
              <div className="px-3 text-[10px] uppercase tracking-wide text-inkfaint">{g.label}</div>
              {g.itens.map((it) => (
                <button key={it.id} onClick={() => escolher(g.area)}
                  className="w-full text-left px-3 py-1.5 text-[12.5px] text-inksoft hover:bg-white/[0.04] hover:text-ink transition truncate">
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
    </div>
  );
}

export default function AdministracaoPanel() {
  const [sub, setSub] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto pb-1 flex-1 min-w-0">
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
        <BuscaGlobal onGoTo={setSub} />
      </div>

      {sub === "dashboard" && <AdminDashboard />}
      {sub === "receitas" && <AdminReceitas />}
      {sub === "despesas" && <AdminDespesas />}
      {sub === "cobrancas" && <AdminCobrancas />}
      {sub === "fluxo" && <AdminFluxoCaixa />}
      {sub === "dre" && <AdminDRE />}
      {sub === "impostos" && <AdminImpostos />}
      {sub === "contas-bancarias" && <AdminContasBancarias />}
      {sub === "clientes" && <AdminClientesFinanceiros />}
      {sub === "contratos" && <AdminContratos />}
      {sub === "equipe" && <AdminEquipe />}
      {sub === "folha" && <AdminFolha />}
      {sub === "comissoes" && <AdminComissoes />}
      {sub === "ferramentas" && <AdminFerramentas />}
      {sub === "fornecedores" && <AdminFornecedores />}
      {sub === "centros-custo" && <AdminCentrosCusto />}
      {sub === "documentos" && <AdminDocumentos />}
      {sub === "processos" && <AdminProcessos />}
      {sub === "aprovacoes" && <AdminAprovacoes />}
      {sub === "prolabore" && <AdminProLabore />}
      {sub === "distribuicao" && <AdminDistribuicaoLucros />}
      {sub === "reserva" && <AdminReservaFinanceira />}
      {sub === "reunioes" && <AdminReunioes />}
      {sub === "metas" && <AdminMetas />}
      {sub === "relatorios" && <AdminRelatorios />}
      {sub === "auditoria" && <AdminAuditoria />}
      {sub === "permissoes" && <AdminPermissoes />}
    </div>
  );
}
