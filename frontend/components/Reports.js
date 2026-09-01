"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

const STATUS_LABEL = { ATIVO: "Ativo", PENDENTE_PAGAMENTO: "Pendente", ONBOARDING: "Onboarding", CANCELADO: "Cancelado" };
const STATUS_COLOR = { ATIVO: "#3ecf8e", PENDENTE_PAGAMENTO: "#f0b429", ONBOARDING: "#ff9142", CANCELADO: "#ff5c5c" };

function currency(n) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Donut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width="110" height="110" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#2b2a28" strokeWidth="14" />
        {total > 0 &&
          data
            .filter((d) => d.value > 0)
            .map((d) => {
              const len = (d.value / total) * c;
              const el = (
                <circle
                  key={d.label}
                  cx="50" cy="50" r={r} fill="none"
                  stroke={d.color} strokeWidth="14"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 50 50)"
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })}
        <text x="50" y="47" textAnchor="middle" className="fill-ink" fontSize="16" fontWeight="700">{total}</text>
        <text x="50" y="61" textAnchor="middle" className="fill-inkfaint" fontSize="8">clientes</text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-inksoft">{d.label}</span>
            <span className="text-ink font-medium mono ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ data, colorClass = "bg-accent" }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-inksoft">{d.label}</span>
            <span className="text-ink font-medium mono">{d.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {data.length === 0 && <div className="text-xs text-inkfaint">Sem dados ainda.</div>}
    </div>
  );
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/reports/summary").then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="text-danger text-sm">{error}</div>;
  if (!data) return <div className="text-inkfaint text-sm">Carregando relatórios…</div>;

  const statusData = Object.entries(data.clientsByStatus).map(([key, value]) => ({
    label: STATUS_LABEL[key], value, color: STATUS_COLOR[key],
  }));

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-inkfaint">Faturamento previsto/mês</div>
          <div className="font-display font-bold text-xl mono mt-1 text-accent">{currency(data.faturamentoPrevisto)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-inkfaint">Pagamentos pendentes</div>
          <div className="font-display font-bold text-xl mono mt-1">{currency(data.pagamentosPendentes)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-inkfaint">Pagamentos atrasados</div>
          <div className="font-display font-bold text-xl mono mt-1 text-danger">{currency(data.pagamentosAtrasados)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-inkfaint">Recebido (histórico)</div>
          <div className="font-display font-bold text-xl mono mt-1 text-success">{currency(data.pagamentosRecebidos)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4.5 shadow-sm overflow-x-auto">
          <h3 className="font-display font-semibold text-sm text-ink mb-4">Clientes por status</h3>
          <Donut data={statusData} />
        </div>
        <div className="bg-surface border border-border rounded-xl p-4.5 shadow-sm">
          <h3 className="font-display font-semibold text-sm text-ink mb-4">Leads por origem</h3>
          <BarList data={data.leadsByOrigin.map((o) => ({ label: o.origin, value: o.count }))} />
        </div>
        <div className="bg-surface border border-border rounded-xl p-4.5 shadow-sm">
          <h3 className="font-display font-semibold text-sm text-ink mb-4">Produtividade por gestor (tarefas concluídas)</h3>
          <BarList
            data={data.tasksByGestor.map((g) => ({ label: g.gestorName, value: g.concluidas }))}
            colorClass="bg-success"
          />
        </div>
        <div className="bg-surface border border-border rounded-xl p-4.5 shadow-sm">
          <h3 className="font-display font-semibold text-sm text-ink mb-4">Tarefas totais por gestor</h3>
          <BarList data={data.tasksByGestor.map((g) => ({ label: g.gestorName, value: g.total }))} />
        </div>
      </div>
    </section>
  );
}
