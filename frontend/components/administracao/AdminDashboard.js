"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, currencyCompact, fmtMonthLabel } from "../../lib/adminFormat";

const PERIOD_OPTIONS = [
  { key: "mes", label: "Mês" },
  { key: "trimestre", label: "Trimestre" },
  { key: "semestre", label: "Semestre" },
  { key: "ano", label: "Ano" },
];

function DeltaBadge({ pct }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const positive = pct >= 0;
  return (
    <span className={`text-[11px] font-semibold ${positive ? "text-success" : "text-danger"}`}>
      {positive ? "+" : ""}
      {pct}% vs. período anterior
    </span>
  );
}

const TONE_CLASS = { ink: "text-ink", success: "text-success", danger: "text-danger" };

function KpiCard({ label, value, delta, tone = "ink", sub }) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
      <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">{label}</div>
      <div className={`text-xl font-display font-semibold mono mt-1 ${TONE_CLASS[tone] || TONE_CLASS.ink}`}>{value}</div>
      {sub && <div className="text-[11px] text-inkfaint mt-0.5">{sub}</div>}
      {delta !== undefined && <div className="mt-1"><DeltaBadge pct={delta} /></div>}
    </div>
  );
}

// Gráfico de barras minimalista, sem lib externa (o projeto não usa nenhuma
// lib de gráfico — ver package.json — então isso evita adicionar uma
// dependência nova só pra essa tela).
function MiniBarChart({ series, keys, colors, height = 120 }) {
  const max = Math.max(1, ...series.flatMap((s) => keys.map((k) => s[k] || 0)));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {series.map((s) => (
        <div key={s.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex items-end justify-center gap-0.5" style={{ height: height - 22 }}>
            {keys.map((k, i) => (
              <div
                key={k}
                title={`${k}: ${currencyCompact(s[k])}`}
                className="flex-1 rounded-t-sm min-w-[4px]"
                style={{ height: `${Math.max(2, ((s[k] || 0) / max) * 100)}%`, backgroundColor: colors[i] }}
              />
            ))}
          </div>
          <div className="text-[9.5px] text-inkfaint truncate w-full text-center">{fmtMonthLabel(s.mes)}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [preset, setPreset] = useState("mes");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await api(`/api/admin/dashboard?preset=${p}`);
      setData(res);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(preset); }, [preset, load]);

  if (loading && !data) return <div className="text-sm text-inkfaint">Carregando…</div>;
  if (!data) return null;

  const { atual, variacao, inadimplencia, clientesAtivos, graficoMensal } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl p-1 w-fit">
        {PERIOD_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => setPreset(o.key)}
            className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition ${preset === o.key ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <KpiCard label="Recebido no período" value={currency(atual.receitaRecebida)} delta={variacao.receitaRecebida} tone="success" />
        <KpiCard label="A receber no período" value={currency(atual.receitaAReceber)} tone="ink" />
        <KpiCard label="Despesas pagas" value={currency(atual.despesasPagas)} delta={variacao.despesasPagas * -1} tone="danger" />
        <KpiCard label="A pagar no período" value={currency(atual.despesasAPagar)} tone="ink" />
        <KpiCard label="Lucro estimado" value={currency(atual.lucro)} delta={variacao.lucro} tone={atual.lucro >= 0 ? "success" : "danger"} />
        <KpiCard label="Margem" value={atual.margem === null ? "—" : `${atual.margem}%`} tone="ink" />
        <KpiCard label="Inadimplência" value={currency(inadimplencia.valor)} tone="danger" sub={`${inadimplencia.clientes} cliente(s) · ${inadimplencia.quantidade} lançamento(s) em atraso`} />
        <KpiCard label="Clientes ativos" value={clientesAtivos} tone="ink" />
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center gap-4 mb-3">
          <h3 className="font-display font-semibold text-sm text-ink">Receita x despesa (últimos 6 meses)</h3>
          <div className="flex items-center gap-3 text-[11px] text-inkfaint">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#3ecf8e] inline-block" /> Receita paga</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#ff5c5c] inline-block" /> Despesa paga</span>
          </div>
        </div>
        <MiniBarChart series={graficoMensal} keys={["receita", "despesa"]} colors={["#3ecf8e", "#ff5c5c"]} />
      </div>
    </div>
  );
}
