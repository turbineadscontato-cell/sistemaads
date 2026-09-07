"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate } from "../../lib/adminFormat";

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AdminDistribuicaoLucros() {
  const [rows, setRows] = useState([]);
  const [socios, setSocios] = useState([]);
  const [fluxo, setFluxo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [referenceMonth, setReferenceMonth] = useState(currentMonthKey());
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [shares, setShares] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s, f] = await Promise.all([
        api("/api/admin/distribuicao-lucros"),
        api("/api/admin/pro-labore?month=" + currentMonthKey()),
        api("/api/admin/fluxo-caixa"),
      ]);
      setRows(d);
      setSocios(s.rows.map((r) => ({ id: r.userId, name: r.name })));
      setFluxo(f);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openForm() {
    setReferenceMonth(currentMonthKey());
    setTotalAmount("");
    setNotes("");
    const eq = {};
    socios.forEach((s) => { eq[s.id] = ""; });
    setShares(eq);
    setShowForm(true);
  }

  function splitEqually() {
    if (!totalAmount || socios.length === 0) return;
    const per = Math.floor((Number(totalAmount) / socios.length) * 100) / 100;
    const next = {};
    socios.forEach((s) => { next[s.id] = String(per); });
    setShares(next);
  }

  const somaParcelas = useMemo(() => Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0), [shares]);

  async function save(e) {
    e.preventDefault();
    const sharesList = socios.map((s) => ({ userId: s.id, amount: Number(shares[s.id]) })).filter((s) => s.amount > 0);
    if (sharesList.length === 0) return alert("Preencha ao menos uma parcela.");
    setSaving(true);
    try {
      await api("/api/admin/distribuicao-lucros", { method: "POST", body: { referenceMonth, totalAmount: Number(totalAmount), notes: notes || null, shares: sharesList } });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {fluxo && (
        <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Saldo atual (informativo — não é lucro disponível automaticamente)</div>
          <div className={`text-xl font-display font-semibold mono mt-1 ${fluxo.saldoAtual >= 0 ? "text-ink" : "text-danger"}`}>{currency(fluxo.saldoAtual)}</div>
          <div className="text-[11.5px] text-inkfaint mt-1">Reserve o que precisar antes de decidir o valor a distribuir — esse número é só o saldo em caixa, não desconta impostos, folha ou reserva.</div>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button onClick={openForm} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Nova distribuição</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Mês</th>
                <th className="px-4 py-2.5">Total distribuído</th>
                <th className="px-4 py-2.5">Parcelas</th>
                <th className="px-4 py-2.5">Lançado por</th>
                <th className="px-4 py-2.5">Data</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Nenhuma distribuição lançada ainda.</td></tr>)}
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5 text-ink">{d.referenceMonth}</td>
                  <td className="px-4 py-2.5 mono text-ink font-semibold">{currency(d.totalAmount)}</td>
                  <td className="px-4 py-2.5 text-inksoft">
                    {d.shares.map((s) => <div key={s.id}>{s.name}: <span className="mono">{currency(s.amount)}</span></div>)}
                  </td>
                  <td className="px-4 py-2.5 text-inksoft">{d.createdBy}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{fmtDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">Nova distribuição de lucros</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Mês de referência</label>
                  <input type="month" value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor total a distribuir (R$) *</label>
                  <input required type="number" step="0.01" min="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
              </div>
              <button type="button" onClick={splitEqually} className="text-[11.5px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Dividir igualmente entre os sócios</button>
              <div className="space-y-2">
                {socios.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <label className="text-[13px] text-inksoft flex-1">{s.name}</label>
                    <input type="number" step="0.01" min="0" value={shares[s.id] ?? ""} onChange={(e) => setShares({ ...shares, [s.id]: e.target.value })}
                      className="w-32 bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm text-ink mono focus:outline-none focus:border-accent" />
                  </div>
                ))}
                {totalAmount && (
                  <div className={`text-[11.5px] ${Math.abs(somaParcelas - Number(totalAmount)) < 0.01 ? "text-success" : "text-warning"}`}>
                    Soma das parcelas: {currency(somaParcelas)} {Math.abs(somaParcelas - Number(totalAmount)) >= 0.01 && `(diferente do total de ${currency(Number(totalAmount))})`}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Observações</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex items-center gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 text-sm font-medium py-2.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 text-sm font-semibold py-2.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
