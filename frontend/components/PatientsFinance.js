"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

// Visão financeira do profissional sobre os próprios pacientes: quanto
// recebe por mês (estimativa), quanto cada um paga, quando vence o
// pagamento de cada um, e quem está com o pacote de sessões acabando (pra
// saber quando cobrar a renovação). Tudo derivado do mesmo GET /api/patients
// que já alimenta o quadro de pacientes — nenhuma rota nova no backend.

const PAYMENT_LABEL = { EM_DIA: "Em dia", PENDENTE: "Pendente", ATRASADO: "Atrasado" };
const PAYMENT_CLASS = {
  EM_DIA: "bg-successsoft text-success",
  PENDENTE: "bg-warningsoft text-warning",
  ATRASADO: "bg-dangersoft text-danger",
};
// Situações em que o paciente ainda está sendo atendido de fato — pausado e
// encerrado saem da estimativa de receita mensal (não vão gerar cobrança
// recorrente), mas continuam listados na tabela pra referência.
const ACTIVE_STATUSES = ["avaliacao", "acompanhamento"];
const DOT_CLASS = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

function packageStatus(p) {
  const sched = p?.sessionSchedule;
  if (!sched || !sched.total) return null;
  const remaining = sched.remaining;
  if (remaining <= 0) return { tone: "danger", label: "Pacote esgotado" };
  if (remaining === 1) return { tone: "warning", label: "Última sessão do pacote" };
  return { tone: "success", label: `${remaining} restantes` };
}

function currency(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Estimativa simples: valor da sessão × sessões por semana × 4 semanas.
// É só uma projeção pra dar uma ideia do mês — não substitui o controle
// real de pagamentos (aba Financeiro do sistema como um todo já cuida
// disso pro lado da TurbinaADS; isso aqui é só pro profissional entender
// quanto tende a receber dos próprios pacientes).
function monthlyEstimate(p) {
  const value = Number(p.sessionValue) || 0;
  const perWeek = (p.weekdays || []).length;
  return value * perWeek * 4;
}

export default function PatientsFinance() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setPatients(await api("/api/patients"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="text-xs text-inkfaint">Carregando…</div>;
  if (error) return <div className="text-xs text-danger">{error}</div>;

  const activePatients = patients.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const totalMonthly = activePatients.reduce((sum, p) => sum + monthlyEstimate(p), 0);
  const renewalAlerts = patients.filter((p) => {
    const s = packageStatus(p);
    return s && s.tone !== "success" && ACTIVE_STATUSES.includes(p.status);
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-base text-ink">Financeiro dos pacientes</h2>
        <p className="text-[11px] text-inkfaint">Quanto você recebe dos seus pacientes, quando cada um paga, e quem precisa renovar o pacote.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-inkfaint">Estimativa de receita mensal</div>
          <div className="font-display font-semibold text-2xl mt-1 mono text-accent">{currency(totalMonthly)}</div>
          <div className="text-[11px] text-inkfaint mt-1">Soma de {activePatients.length} paciente(s) ativo(s) — valor da sessão × sessões por semana × 4.</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-inkfaint">Pacotes acabando</div>
          <div className="font-display font-semibold text-2xl mt-1 text-ink">{renewalAlerts.length}</div>
          <div className="text-[11px] text-inkfaint mt-1">Paciente(s) na última sessão ou com o pacote esgotado.</div>
        </div>
      </div>

      {renewalAlerts.length > 0 && (
        <div className="bg-warningsoft border border-warning/30 rounded-2xl px-4 py-3.5 space-y-2">
          <div className="text-[12.5px] font-semibold text-warning">Hora de falar sobre renovação</div>
          <div className="flex flex-wrap gap-1.5">
            {renewalAlerts.map((p) => {
              const s = packageStatus(p);
              return (
                <span key={p.id} className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full ${s.tone === "danger" ? "bg-dangersoft text-danger" : "bg-warningsoft text-warning"}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[s.tone]}`} />
                  {p.name} — {s.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Por paciente</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkfaint border-b border-border">
                <th className="px-4 py-2 font-medium">Paciente</th>
                <th className="px-4 py-2 font-medium">Valor sessão</th>
                <th className="px-4 py-2 font-medium">Sessões/semana</th>
                <th className="px-4 py-2 font-medium">Estimativa mensal</th>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Pagamento</th>
                <th className="px-4 py-2 font-medium">Pacote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patients.map((p) => {
                const s = packageStatus(p);
                return (
                  <tr key={p.id} className={ACTIVE_STATUSES.includes(p.status) ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 text-ink font-medium truncate max-w-[160px]">{p.name}</td>
                    <td className="px-4 py-2.5 mono text-ink">{currency(p.sessionValue)}</td>
                    <td className="px-4 py-2.5 mono text-inksoft">{(p.weekdays || []).length}x</td>
                    <td className="px-4 py-2.5 mono text-ink">{currency(monthlyEstimate(p))}</td>
                    <td className="px-4 py-2.5 mono text-inksoft">{p.paymentDueDay ? `dia ${p.paymentDueDay}` : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full font-medium ${PAYMENT_CLASS[p.paymentStatus]}`}>{PAYMENT_LABEL[p.paymentStatus]}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {s ? (
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-inksoft">
                          <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[s.tone]}`} />
                          {s.label}
                        </span>
                      ) : <span className="text-[11.5px] text-inkfaint">sem pacote</span>}
                    </td>
                  </tr>
                );
              })}
              {patients.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint text-xs">Nenhum paciente cadastrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
