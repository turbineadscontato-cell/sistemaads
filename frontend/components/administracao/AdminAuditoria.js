"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/adminFormat";

const ENTITY_FILTERS = [
  { value: "", label: "Todas as áreas" },
  { value: "Receita", label: "Receitas" },
  { value: "Despesa", label: "Despesas" },
  { value: "Contrato", label: "Contratos" },
  { value: "Membro da equipe", label: "Equipe" },
  { value: "Ferramenta/Assinatura", label: "Ferramentas" },
  { value: "Fornecedor", label: "Fornecedores" },
  { value: "Pagamento de folha", label: "Folha" },
  { value: "Meta", label: "Metas" },
  { value: "Reunião de sócios", label: "Reuniões" },
];

const ACTION_CLASS = { "CRIAÇÃO": "bg-successsoft text-success", "EDIÇÃO": "bg-warningsoft text-warning", "EXCLUSÃO/CANCELAMENTO": "bg-dangersoft text-danger" };

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
}

export default function AdminAuditoria() {
  const [rows, setRows] = useState([]);
  const [entity, setEntity] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api(`/api/admin/auditoria${entity ? `?entity=${encodeURIComponent(entity)}` : ""}`));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={entity} onChange={(e) => setEntity(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {ENTITY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span className="text-[11.5px] text-inkfaint">Últimas {rows.length} ações (só leitura — não é possível apagar este histórico)</span>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Data/hora</th>
                <th className="px-4 py-2.5">Quem</th>
                <th className="px-4 py-2.5">Ação</th>
                <th className="px-4 py-2.5">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={4} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={4} className="px-4 py-6 text-center text-inkfaint">Nenhuma ação registrada ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 mono text-inksoft whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.user}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ACTION_CLASS[r.action] || "bg-white/5 text-inksoft"}`}>{r.action}</span></td>
                  <td className="px-4 py-2.5 text-ink">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
