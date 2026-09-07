"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, TOOL_CATEGORY_OPTIONS } from "../../lib/adminFormat";

function emptyForm() {
  return { name: "", category: TOOL_CATEGORY_OPTIONS[0], monthlyValue: "", renewalDate: "", responsible: "", url: "", notes: "" };
}

function Renewal({ diasParaVencer, diasAtraso }) {
  if (diasAtraso !== null) return <span className="text-[11px] font-semibold text-danger">venceu há {diasAtraso} dia(s)</span>;
  if (diasParaVencer !== null && diasParaVencer <= 7) return <span className="text-[11px] font-semibold text-warning">renova em {diasParaVencer} dia(s)</span>;
  if (diasParaVencer !== null) return <span className="text-[11px] text-inkfaint">renova em {diasParaVencer} dia(s)</span>;
  return <span className="text-[11px] text-inkfaint">—</span>;
}

export default function AdminFerramentas() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/ferramentas"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalMensal = useMemo(() => rows.filter((r) => r.status === "ATIVO").reduce((s, r) => s + (r.monthlyValue || 0), 0), [rows]);

  function openNew() { setEditing(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ name: r.name, category: r.category || TOOL_CATEGORY_OPTIONS[0], monthlyValue: r.monthlyValue ?? "", renewalDate: r.renewalDate ? String(r.renewalDate).slice(0, 10) : "", responsible: r.responsible || "", url: r.url || "", notes: r.notes || "" });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Preencha o nome da ferramenta.");
    setSaving(true);
    const body = {
      name: form.name.trim(), category: form.category || null,
      monthlyValue: form.monthlyValue !== "" ? Number(form.monthlyValue) : null,
      renewalDate: form.renewalDate || null, responsible: form.responsible || null,
      url: form.url || null, notes: form.notes || null,
    };
    try {
      if (editing) await api(`/api/admin/ferramentas/${editing.id}`, { method: "PATCH", body });
      else await api("/api/admin/ferramentas", { method: "POST", body });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelar(r) {
    if (!confirm(`Cancelar a assinatura "${r.name}"?`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/ferramentas/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">Total mensal (ativas)</div>
          <div className="mono text-ink font-semibold">{currency(totalMensal)}</div>
        </div>
        <button onClick={openNew} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Nova ferramenta</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Ferramenta</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Valor mensal</th>
                <th className="px-4 py-2.5">Renovação</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Nenhuma ferramenta cadastrada ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border cursor-pointer hover:bg-white/[0.03] transition" onClick={() => openEdit(r)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.category || "—"}</td>
                  <td className="px-4 py-2.5 mono text-ink">{r.monthlyValue ? currency(r.monthlyValue) : "—"}</td>
                  <td className="px-4 py-2.5"><Renewal diasParaVencer={r.diasParaVencer} diasAtraso={r.diasAtraso} /></td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${r.status === "ATIVO" ? "bg-successsoft text-success" : "bg-white/5 text-inkfaint line-through"}`}>{r.status === "ATIVO" ? "Ativo" : "Cancelado"}</span>
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {r.status === "ATIVO" && (
                      <button disabled={busyId === r.id} onClick={() => cancelar(r)}
                        className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Cancelar</button>
                    )}
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
              <h3 className="font-display font-semibold text-ink">{editing ? "Editar ferramenta" : "Nova ferramenta"}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {TOOL_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor mensal (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.monthlyValue} onChange={(e) => setForm({ ...form, monthlyValue: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Próxima renovação</label>
                <input type="date" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Responsável</label>
                <input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Link</label>
                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
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
