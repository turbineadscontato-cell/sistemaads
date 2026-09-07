"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, AdminStatusPill } from "../../lib/adminFormat";

const FIN_STATUS_LABEL = {
  ATRASADO: "Atrasado",
  PENDENTE: "Pendente",
  EM_DIA: "Em dia",
  SEM_LANCAMENTO: "Sem lançamento",
};
const FIN_STATUS_CLASS = {
  ATRASADO: "bg-dangersoft text-danger",
  PENDENTE: "bg-warningsoft text-warning",
  EM_DIA: "bg-successsoft text-success",
  SEM_LANCAMENTO: "bg-white/5 text-inkfaint",
};

export default function AdminClientesFinanceiros() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/clientes-financeiros"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => !query || r.name.toLowerCase().includes(query));
  }, [rows, q]);

  async function openDetail(id) {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await api(`/api/admin/clientes-financeiros/${id}`));
    } catch (err) {
      alert(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…"
        className="w-full sm:max-w-xs bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent" />

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Status financeiro</th>
                <th className="px-4 py-2.5">Total pago</th>
                <th className="px-4 py-2.5">Pendente</th>
                <th className="px-4 py-2.5">Atrasado</th>
                <th className="px-4 py-2.5">Próximo vencimento</th>
                <th className="px-4 py-2.5">Último pagamento</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint">Nenhum cliente encontrado.</td></tr>)}
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => openDetail(r.id)} className="border-t border-border cursor-pointer hover:bg-white/[0.03] transition">
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${FIN_STATUS_CLASS[r.statusFinanceiro]}`}>{FIN_STATUS_LABEL[r.statusFinanceiro]}</span></td>
                  <td className="px-4 py-2.5 mono text-success">{currency(r.totalPago)}</td>
                  <td className="px-4 py-2.5 mono text-ink">{currency(r.totalPendente)}</td>
                  <td className="px-4 py-2.5 mono text-danger">{currency(r.totalAtrasado)}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{fmtDate(r.proximoVencimento)}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{fmtDate(r.ultimoPagamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openId && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setOpenId(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-lg bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-semibold text-ink">{detail?.client?.name || "Carregando…"}</h3>
              <button onClick={() => setOpenId(null)} className="text-inksoft hover:text-ink text-lg leading-none">×</button>
            </div>
            <div className="px-5 py-4 space-y-2">
              {detailLoading && <div className="text-sm text-inkfaint">Carregando histórico…</div>}
              {!detailLoading && detail?.historico?.length === 0 && (
                <div className="text-sm text-inkfaint">Nenhum lançamento financeiro registrado ainda pra este cliente.</div>
              )}
              {!detailLoading && detail?.historico?.map((h) => (
                <div key={h.id} className="bg-surface2 border border-border rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink truncate">{h.description}</div>
                    <div className="text-[11px] text-inkfaint">{h.category || "—"} · vence {fmtDate(h.dueDate)}{h.paidDate ? ` · pago em ${fmtDate(h.paidDate)}` : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="mono text-ink text-sm">{currency(h.amount)}</div>
                    <AdminStatusPill status={h.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
