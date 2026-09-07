"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, AdminStatusPill, EXPENSE_CATEGORY_OPTIONS, PAYMENT_METHOD_OPTIONS } from "../../lib/adminFormat";

const STATUS_FILTERS = ["TODOS", "PREVISTO", "PENDENTE", "ATRASADO", "PAGO", "CANCELADO"];
const MAX_RECEIPT_BYTES = 5_500_000; // margem abaixo do teto de 8MB no backend

function emptyForm() {
  return {
    description: "",
    supplier: "",
    category: EXPENSE_CATEGORY_OPTIONS[0],
    amount: "",
    dueDate: "",
    paymentMethod: "",
    costCenter: "",
    responsible: "",
    notes: "",
    recurring: false,
    recurrenceDay: "",
    receiptName: "",
    receiptMimeType: "",
    receiptBase64: "",
  };
}

export default function AdminDespesas() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [fileError, setFileError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/despesas"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows
      .filter((r) => statusFilter === "TODOS" || r.status === statusFilter)
      .filter((r) => !query || r.description.toLowerCase().includes(query) || (r.supplier || "").toLowerCase().includes(query));
  }, [rows, statusFilter, q]);

  const totals = useMemo(() => ({
    pendente: filtered.filter((r) => r.status === "PENDENTE" || r.status === "PREVISTO").reduce((s, r) => s + r.amount, 0),
    atrasado: filtered.filter((r) => r.status === "ATRASADO").reduce((s, r) => s + r.amount, 0),
    pago: filtered.filter((r) => r.status === "PAGO").reduce((s, r) => s + r.amount, 0),
  }), [filtered]);

  function onReceiptFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (file.size > MAX_RECEIPT_BYTES) {
      setFileError("Arquivo muito grande (máximo ~5MB).");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, receiptName: file.name, receiptMimeType: file.type, receiptBase64: reader.result }));
    reader.readAsDataURL(file);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return alert("Preencha descrição e valor.");
    setSaving(true);
    try {
      await api("/api/admin/despesas", {
        method: "POST",
        body: {
          description: form.description.trim(),
          supplier: form.supplier || null,
          category: form.category || null,
          amount: Number(form.amount),
          dueDate: form.dueDate || null,
          paymentMethod: form.paymentMethod || null,
          costCenter: form.costCenter || null,
          responsible: form.responsible || null,
          notes: form.notes || null,
          recurring: form.recurring,
          recurrenceDay: form.recurring ? Number(form.recurrenceDay) || (form.dueDate ? new Date(form.dueDate).getUTCDate() : 1) : null,
          receiptName: form.receiptName || null,
          receiptMimeType: form.receiptMimeType || null,
          receiptBase64: form.receiptBase64 || null,
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
    if (!confirm(`Cancelar a despesa "${r.description}"? O registro fica marcado como cancelado, sem apagar o histórico.`)) return;
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
        <div className="flex-1 min-w-[160px]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descrição ou fornecedor…"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "TODOS" ? "Todos os status" : s}</option>)}
        </select>
        <button onClick={() => { setForm(emptyForm()); setFileError(""); setShowForm(true); }}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Nova despesa</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">Pendente/previsto</div>
          <div className="mono text-ink font-semibold">{currency(totals.pendente)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">Atrasado</div>
          <div className="mono text-danger font-semibold">{currency(totals.atrasado)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">Pago</div>
          <div className="mono text-success font-semibold">{currency(totals.pago)}</div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Fornecedor</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Vencimento</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint">Nenhuma despesa encontrada.</td></tr>)}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink">{r.description}{r.recurring && <span className="ml-1.5 text-[10px] text-inkfaint">↻ recorrente</span>}{r.hasReceipt && <span className="ml-1.5 text-[10px] text-inkfaint">📎</span>}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.supplier || "—"}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.category || "—"}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{fmtDate(r.dueDate)}</td>
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
              <h3 className="font-display font-semibold text-ink">Nova despesa</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Descrição *</label>
                <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Fornecedor</label>
                  <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {EXPENSE_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Forma de pagamento</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="">—</option>
                    {PAYMENT_METHOD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Centro de custo</label>
                  <input value={form.costCenter} onChange={(e) => setForm({ ...form, costCenter: e.target.value })} placeholder="ex: Comercial"
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Responsável</label>
                <input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Comprovante (opcional)</label>
                <input type="file" accept="image/*,application/pdf" onChange={onReceiptFile}
                  className="w-full mt-1 text-[12.5px] text-inksoft file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-ink" />
                {form.receiptName && <div className="text-[11px] text-inkfaint mt-1">Anexado: {form.receiptName}</div>}
                {fileError && <div className="text-[11px] text-danger mt-1">{fileError}</div>}
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <label className="flex items-center gap-2 text-[13px] text-inksoft">
                <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
                Despesa recorrente (gera os próximos 2 meses automaticamente)
              </label>
              {form.recurring && (
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Dia do mês da recorrência</label>
                  <input type="number" min="1" max="31" value={form.recurrenceDay} onChange={(e) => setForm({ ...form, recurrenceDay: e.target.value })}
                    placeholder={form.dueDate ? String(new Date(form.dueDate).getUTCDate()) : "ex: 5"}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
              )}
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
