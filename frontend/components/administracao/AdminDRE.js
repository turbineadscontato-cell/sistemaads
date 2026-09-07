"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

const PERIOD_OPTIONS = [
  { value: "mes", label: "Mês atual" },
  { value: "trimestre", label: "Últimos 3 meses" },
  { value: "semestre", label: "Últimos 6 meses" },
  { value: "ano", label: "Últimos 12 meses" },
];

function Bar({ amount, max, tone }) {
  const pct = max > 0 ? Math.max(2, Math.round((amount / max) * 100)) : 0;
  const toneClass = tone === "success" ? "bg-success" : "bg-danger";
  return (
    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden mt-1">
      <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminDRE() {
  const [preset, setPreset] = useState("mes");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/admin/dre?preset=${preset}`));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="text-sm text-inkfaint">Carregando…</div>;
  if (!data) return null;

  const maxReceita = Math.max(1, ...data.receitaPorCategoria.map((r) => r.amount));
  const maxDespesa = Math.max(1, ...data.despesaPorCategoria.map((d) => d.amount));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-sm text-ink">DRE gerencial (regime de caixa — só o que já foi pago/recebido)</h3>
        <select value={preset} onChange={(e) => setPreset(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Receita bruta</div>
          <div className="text-xl font-display font-semibold mono mt-1 text-success">{currency(data.receitaBruta)}</div>
        </div>
        <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Despesas totais</div>
          <div className="text-xl font-display font-semibold mono mt-1 text-danger">{currency(data.totalDespesas)}</div>
        </div>
        <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Resultado líquido{data.margem !== null ? ` · margem ${data.margem}%` : ""}</div>
          <div className={`text-xl font-display font-semibold mono mt-1 ${data.resultadoLiquido >= 0 ? "text-success" : "text-danger"}`}>{currency(data.resultadoLiquido)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <h4 className="text-[12px] uppercase tracking-wide text-inkfaint mb-3">(+) Receitas por categoria</h4>
          {data.receitaPorCategoria.length === 0 && <div className="text-sm text-inkfaint">Nenhuma receita paga nesse período.</div>}
          <div className="space-y-2.5">
            {data.receitaPorCategoria.map((r) => (
              <div key={r.category}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-inksoft">{r.category}</span>
                  <span className="mono text-ink">{currency(r.amount)}</span>
                </div>
                <Bar amount={r.amount} max={maxReceita} tone="success" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <h4 className="text-[12px] uppercase tracking-wide text-inkfaint mb-3">(−) Despesas por categoria</h4>
          {data.despesaPorCategoria.length === 0 && <div className="text-sm text-inkfaint">Nenhuma despesa paga nesse período.</div>}
          <div className="space-y-2.5">
            {data.despesaPorCategoria.map((d) => (
              <div key={d.category}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-inksoft">{d.category}</span>
                  <span className="mono text-ink">{currency(d.amount)}</span>
                </div>
                <Bar amount={d.amount} max={maxDespesa} tone="danger" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        DRE calculado em regime de caixa (só considera o que já foi efetivamente pago/recebido, não o previsto) — a partir dos lançamentos de Receitas e Despesas. Não inclui ainda pró-labore/distribuição de lucros como linhas separadas (fase 3).
      </div>
    </div>
  );
}
