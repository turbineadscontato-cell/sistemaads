"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import AnimatedNumber from "./AnimatedNumber";
import { IconMoney } from "./icons";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const STATUS_META = {
  SOLICITADA: { label: "Aguardando", cls: "bg-warningsoft text-warning" },
  APROVADA: { label: "Aprovada", cls: "bg-successsoft text-success" },
  RECUSADA: { label: "Recusada", cls: "bg-dangersoft text-danger" },
};

// Widget do "meu saldo" do gestor (visível também pro sócio, que atua como
// gestor de alguns clientes) — mostra o saldo a receber (comissões de R$50
// por serviço aceito, menos saques já aprovados), com contagem animada
// quando o saldo muda, e um botão pra solicitar retirada de emergência.
export default function MeuSaldo() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api("/api/finance/me");
      setData(res);
    } catch (err) {
      // silencioso — widget opcional, não deve travar o resto do painel
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function requestWithdrawal(e) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return;
    setSaving(true);
    try {
      await api("/api/finance/withdrawals", { method: "POST", body: { amount: value, note: note || null } });
      setAmount("");
      setNote("");
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) return null;

  const pending = data.withdrawals.filter((w) => w.status === "SOLICITADA");

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4.5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-successsoft text-success flex items-center justify-center shrink-0"><IconMoney className="w-4 h-4" /></span>
          <div>
            <h3 className="font-display font-semibold text-sm text-ink">Meu saldo a receber</h3>
            <div className="text-[11px] text-inkfaint">R$50 por serviço aceito, menos saques já aprovados</div>
          </div>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-accentsoft text-accent hover:brightness-95 transition shrink-0">
          {showForm ? "Cancelar" : "Solicitar saque"}
        </button>
      </div>

      <div className="px-4.5 py-3.5">
        <AnimatedNumber value={data.balance} className="font-display font-bold text-3xl mono text-ink" />
        <div className="text-[11px] text-inkfaint mt-1">
          Total ganho: {Number(data.totalCommissions).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · já retirado: {Number(data.totalWithdrawn).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </div>
      </div>

      {showForm && (
        <form onSubmit={requestWithdrawal} className="px-4.5 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end border-t border-border pt-3.5">
          <div>
            <label className="block text-[11px] text-inkfaint mb-1">Valor</label>
            <input required type="number" min="0.01" step="0.01" max={data.balance} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink mono" />
          </div>
          <div>
            <label className="block text-[11px] text-inkfaint mb-1">Motivo (opcional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink" />
          </div>
          <button disabled={saving} className="bg-accent text-white text-sm font-medium py-1.5 rounded-lg hover:bg-accentink transition disabled:opacity-60">
            {saving ? "Enviando…" : "Enviar solicitação"}
          </button>
        </form>
      )}

      {pending.length > 0 && (
        <div className="px-4.5 py-2.5 border-t border-border bg-warningsoft/40">
          <div className="text-[11.5px] text-warning font-medium">{pending.length} solicitação(ões) aguardando o sócio aprovar.</div>
        </div>
      )}

      {data.withdrawals.length > 0 && (
        <div className="border-t border-border divide-y divide-border max-h-48 overflow-y-auto">
          {data.withdrawals.map((w) => (
            <div key={w.id} className="px-4.5 py-2 flex items-center justify-between gap-2 text-[12.5px]">
              <div className="min-w-0">
                <div className="text-ink mono">{Number(w.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div className="text-inkfaint text-[11px] truncate">{w.note || "sem observação"} · {fmtDate(w.createdAt)}</div>
              </div>
              <span className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${STATUS_META[w.status].cls}`}>{STATUS_META[w.status].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
