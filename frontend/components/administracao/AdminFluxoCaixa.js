"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, currencyCompact, fmtMonthLabel } from "../../lib/adminFormat";

const HORIZON_LABEL = { 30: "30 dias", 60: "60 dias", 90: "90 dias", 180: "6 meses", 365: "12 meses" };

function MiniBarChart({ series, height = 140 }) {
  const max = Math.max(1, ...series.flatMap((s) => [s.entradasRealizado, s.saidasRealizado]));
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height }}>
      {series.map((s) => (
        <div key={s.mes} className="flex-1 min-w-[26px] flex flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center gap-0.5" style={{ height: height - 22 }}>
            <div title={`Entradas: ${currencyCompact(s.entradasRealizado)}`} className="flex-1 rounded-t-sm bg-[#3ecf8e] min-w-[4px]" style={{ height: `${Math.max(2, (s.entradasRealizado / max) * 100)}%` }} />
            <div title={`Saídas: ${currencyCompact(s.saidasRealizado)}`} className="flex-1 rounded-t-sm bg-[#ff5c5c] min-w-[4px]" style={{ height: `${Math.max(2, (s.saidasRealizado / max) * 100)}%` }} />
          </div>
          <div className="text-[9px] text-inkfaint">{fmtMonthLabel(s.mes)}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminFluxoCaixa() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api("/api/admin/fluxo-caixa"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="text-sm text-inkfaint">Carregando…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
        <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Saldo atual (receitas pagas − despesas pagas, histórico total)</div>
        <div className={`text-2xl font-display font-semibold mono mt-1 ${data.saldoAtual >= 0 ? "text-success" : "text-danger"}`}>{currency(data.saldoAtual)}</div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center gap-4 mb-3">
          <h3 className="font-display font-semibold text-sm text-ink">Realizado (últimos 12 meses)</h3>
          <div className="flex items-center gap-3 text-[11px] text-inkfaint">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#3ecf8e] inline-block" /> Entradas</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#ff5c5c] inline-block" /> Saídas</span>
          </div>
        </div>
        <MiniBarChart series={data.serie} />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-ink">Projeção de saldo</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Horizonte</th>
                <th className="px-4 py-2.5">Entradas previstas</th>
                <th className="px-4 py-2.5">Saídas previstas</th>
                <th className="px-4 py-2.5">Saldo projetado</th>
              </tr>
            </thead>
            <tbody>
              {data.projecoes.map((p) => (
                <tr key={p.dias} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink">{HORIZON_LABEL[p.dias] || `${p.dias} dias`}</td>
                  <td className="px-4 py-2.5 mono text-success">{currency(p.entradasPrevistas)}</td>
                  <td className="px-4 py-2.5 mono text-danger">{currency(p.saidasPrevistas)}</td>
                  <td className={`px-4 py-2.5 mono font-semibold ${p.saldoProjetado >= 0 ? "text-success" : "text-danger"}`}>{currency(p.saldoProjetado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
