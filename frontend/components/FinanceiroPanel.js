"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import AnimatedNumber from "./AnimatedNumber";
import RankBadge from "./RankBadge";
import { IconClock, IconMoney } from "./icons";

function currency(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function initials(name = "") {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// Aba Financeiro (só sócio) — pedidos de saque pendentes (pra aprovar ou
// recusar), e um resumo por gestor de quanto cada um já ganhou em comissão,
// quanto já foi repassado, e o saldo atual.
export default function FinanceiroPanel() {
  const [summary, setSummary] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        api("/api/finance/summary"),
        api("/api/finance/withdrawals"),
      ]);
      setSummary(s);
      setWithdrawals(w);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(w, status) {
    setBusyId(w.id);
    try {
      await api(`/api/finance/withdrawals/${w.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !summary) {
    return <div className="text-sm text-inkfaint">Carregando…</div>;
  }

  const pending = withdrawals.filter((w) => w.status === "SOLICITADA");
  const resolved = withdrawals.filter((w) => w.status !== "SOLICITADA").slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4.5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm text-ink">Solicitações de saque pendentes</h3>
          {pending.length > 0 && <span className="text-[10.5px] bg-dangersoft text-danger px-2 py-0.5 rounded-full font-semibold">{pending.length}</span>}
        </div>
        {pending.length === 0 ? (
          <div className="px-4.5 py-6 text-center text-[13px] text-inkfaint">Nenhuma solicitação aguardando decisão.</div>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((w) => (
              <div key={w.id} className="px-4.5 py-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accentsoft text-accent text-[11px] font-bold flex items-center justify-center shrink-0">{initials(w.gestor?.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-ink font-medium">{w.gestor?.name} <span className="mono font-normal text-inksoft">— {currency(w.amount)}</span></div>
                  <div className="text-[11px] text-inkfaint truncate">{w.note || "sem observação"} · pedido em {fmtDate(w.createdAt)}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button disabled={busyId === w.id} onClick={() => decide(w, "RECUSADA")}
                    className="text-[12px] font-medium px-2.5 py-1.5 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Recusar</button>
                  <button disabled={busyId === w.id} onClick={() => decide(w, "APROVADA")}
                    className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Aprovar e repassar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4.5 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-ink">Repasse por gestor</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4.5 py-2.5">Gestor</th>
                <th className="px-4.5 py-2.5">Comissão total</th>
                <th className="px-4.5 py-2.5">Já repassado</th>
                <th className="px-4.5 py-2.5">Saldo atual</th>
              </tr>
            </thead>
            <tbody>
              {summary?.gestores.map((g) => (
                <tr key={g.id} className="border-t border-border">
                  <td className="px-4.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accentsoft text-accent text-[10px] font-bold flex items-center justify-center shrink-0">{initials(g.name)}</span>
                      <span className="text-ink font-medium">{g.name}</span>
                      <RankBadge rank={g.rank} size="sm" />
                    </div>
                  </td>
                  <td className="px-4.5 py-2.5 mono text-ink">{currency(g.totalCommissions)}</td>
                  <td className="px-4.5 py-2.5 mono text-inksoft">{currency(g.totalWithdrawn)}</td>
                  <td className="px-4.5 py-2.5 mono text-success font-semibold">{currency(g.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resolved.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4.5 py-3 border-b border-border flex items-center gap-2">
            <IconClock className="w-4 h-4 text-inkfaint" />
            <h3 className="font-display font-semibold text-sm text-ink">Histórico de saques</h3>
          </div>
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            {resolved.map((w) => (
              <div key={w.id} className="px-4.5 py-2.5 flex items-center justify-between gap-2 text-[12.5px]">
                <div className="min-w-0">
                  <div className="text-ink">{w.gestor?.name} <span className="mono text-inksoft">— {currency(w.amount)}</span></div>
                  <div className="text-inkfaint text-[11px] truncate">{w.note || "sem observação"} · decidido em {fmtDate(w.resolvedAt)}</div>
                </div>
                <span className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${w.status === "APROVADA" ? "bg-successsoft text-success" : "bg-dangersoft text-danger"}`}>
                  {w.status === "APROVADA" ? "Aprovada" : "Recusada"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
