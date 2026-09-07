"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

export default function AdminReservaFinanceira() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [targetMonths, setTargetMonths] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api("/api/admin/reserva-financeira"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveTarget(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admin/reserva-financeira", { method: "PATCH", body: { targetMonths: Number(targetMonths) } });
      setEditing(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <div className="text-sm text-inkfaint">Carregando…</div>;
  if (!data) return null;

  const pct = data.mesesAtuais !== null ? Math.min(100, Math.round((data.mesesAtuais / data.targetMonths) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm text-ink">Reserva financeira</h3>
          {!editing && (
            <button onClick={() => { setTargetMonths(String(data.targetMonths)); setEditing(true); }}
              className="text-[11.5px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Editar meta</button>
          )}
        </div>

        {editing ? (
          <form onSubmit={saveTarget} className="flex items-center gap-2 mt-3">
            <input type="number" step="0.5" min="0.5" value={targetMonths} onChange={(e) => setTargetMonths(e.target.value)}
              className="w-24 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
            <span className="text-[13px] text-inksoft">meses de despesa</span>
            <button type="submit" disabled={saving} className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Salvar</button>
            <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] font-medium px-3 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Cancelar</button>
          </form>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Saldo atual</div>
                <div className="text-lg font-display font-semibold mono mt-1 text-ink">{currency(data.saldoAtual)}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Despesa média/mês</div>
                <div className="text-lg font-display font-semibold mono mt-1 text-inksoft">{currency(data.mediaDespesaMensal)}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Meta</div>
                <div className="text-lg font-display font-semibold mono mt-1 text-inksoft">{data.targetMonths} meses</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[12.5px] mb-1">
                <span className="text-inksoft">{data.mesesAtuais !== null ? `${data.mesesAtuais} meses de caixa hoje` : "sem despesa suficiente pra calcular"}</span>
                <span className={data.metaAtingida ? "text-success font-semibold" : "text-warning font-semibold"}>{data.metaAtingida ? "Meta atingida" : "Abaixo da meta"}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${data.metaAtingida ? "bg-success" : "bg-warning"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        Calculado a partir do saldo atual (receitas pagas − despesas pagas) e da despesa média dos últimos 3 meses — mostra quantos meses de operação o caixa atual sustentaria sem nenhuma receita nova.
      </div>
    </div>
  );
}
