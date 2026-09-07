"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, AdminStatusPill, PAYMENT_METHOD_OPTIONS } from "../../lib/adminFormat";

// Reaproveita o mesmo lançamento de Despesa (categoria fixa "Impostos") —
// essa tela só é uma visão especializada com alerta de vencimento, sem
// duplicar nenhuma tabela nova (ver comentário em backend/src/routes/admin.js).
const STATUS_FILTERS = ["TODOS", "PREVISTO", "PENDENTE", "ATRASADO", "PAGO", "CANCELADO"];

function emptyForm() {
  return { description: "", amount: "", dueDate: "", paymentMethod: "", notes: "" };
}

function Urgency({ diasParaVencer, diasAtraso }) {
  if (diasAtraso !== null) return <span className="text-[11px] font-semibold text-danger">{diasAtraso} dia(s) em atraso</span>;
  if (diasParaVencer === 0) return <span className="text-[11px] font-semibold text-warning">Vence hoje</span>;
  if (diasParaVencer !== null && diasParaVencer <= 7) return <span className="text-[11px] font-semibold text-warning">Vence em {diasParaVencer} dia(s)</span>;
  if (diasParaVencer !== null) return <span className="text-[11px] text-inkfaint">Vence em {diasParaVencer} dia(s)</span>;
  return <span className="text-[11px] text-inkfaint">—</span>;
}

export default function AdminImpostos() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/impostos"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => statusFilter === "TODOS" || r.status === statusFilter), [rows, statusFilter]);

  const totals = useMemo(() => ({
    aVencer: filtered.filter((r) => r.status === "PENDENTE" || r.status === "PREVISTO").reduce((s, r) => s + r.amount, 0),
    atrasado: filtered.filter((r) => r.status === "ATRASADO").reduce((s, r) => s + r.amount, 0),
  }), [filtered]);

  async function save(e) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return alert("Preencha descrição e valor.");
    setSaving(true);
    try {
      await api("/api/admin/despesas", {
        method: "POST",
        body: {
          description: form.description.trim(),
          category: "Impostos",
          amount: Number(form.amount),
          dueDate: form.dueDate || null,
          paymentMethod: form.paymentMethod || null,
          notes: form.notes || null,
        },
      });
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(r) {
    setBusyId(r.id);
    try {
      await api(`/api/admin/despesas/${r.id}`, { method: "PATCH", body: { status: "PAGO" } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelEntry(r) {
    if (!confirm(`Cancelar o imposto "${r.description}"? O registro fica marcado como cancelado, sem apagar o histórico.`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/despesas/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "TODOS" ? "Todos os status" : s}</option>)}
        </select>
        <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Novo imposto</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">A vencer</div>
          <div className="mono text-ink font-semibold">{currency(totals.aVencer)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">Em atraso</div>
          <div className="mono text-danger font-semibold">{currency(totals.atrasado)}</div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Vencimento</th>
                <th className="px-4 py-2.5">Urgência</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Nenhum imposto lançado ainda.</td></tr>)}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink">{r.description}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{fmtDate(r.dueDate)}</td>
                  <td className="px-4 py-2.5"><Urgency diasParaVencer={r.diasParaVencer} diasAtraso={r.diasAtraso} /></td>
                  <td className="px-4 py-2.5 mono text-ink">{currency(r.amount)}</td>
                  <td className="px-4 py-2.5"><AdminStatusPill status={r.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.status !== "PAGO" && r.status !== "CANCELADO" && (
                        <button disabled={busyId === r.id} onClick={() => markPaid(r)}
                          className="text-[11.5px] font-semibold px-2 py-1 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Marcar pago</button>
                      )}
                      {r.status !== "CANCELADO" && (
                        <button disabled={busyId === r.id} onClick={() => cancelEntry(r)}
                          className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Cancelar</button>
                      )}
                    </div>
                  </td>
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
              <h3 className="font-display font-semibold text-ink">Novo imposto</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Descrição *</label>
                <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="ex: DAS Simples Nacional — 09/2026"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor (R$) *</label>
                  <input required type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Vencimento</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Forma de pagamento</label>
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                  <option value="">—</option>
                  {PAYMENT_METHOD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
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
