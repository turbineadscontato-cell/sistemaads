"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

function emptyForm() {
  return { name: "", category: "", contact: "", notes: "", status: "ATIVO" };
}

export default function AdminFornecedores() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/fornecedores"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ name: r.name, category: r.category || "", contact: r.contact || "", notes: r.notes || "", status: r.status });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Preencha o nome do fornecedor.");
    setSaving(true);
    const body = { name: form.name.trim(), category: form.category || null, contact: form.contact || null, notes: form.notes || null, status: form.status };
    try {
      if (editing) await api(`/api/admin/fornecedores/${editing.id}`, { method: "PATCH", body });
      else await api("/api/admin/fornecedores", { method: "POST", body });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function inativar(r) {
    if (!confirm(`Marcar "${r.name}" como inativo?`)) return;
    try {
      await api(`/api/admin/fornecedores/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={openNew} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Novo fornecedor</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">Total gasto (estimado)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Nenhum fornecedor cadastrado ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border cursor-pointer hover:bg-white/[0.03] transition" onClick={() => openEdit(r)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.category || "—"}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.contact || "—"}</td>
                  <td className="px-4 py-2.5 mono text-ink">{currency(r.totalGasto)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${r.status === "ATIVO" ? "bg-successsoft text-success" : "bg-white/5 text-inkfaint"}`}>{r.status === "ATIVO" ? "Ativo" : "Inativo"}</span>
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {r.status === "ATIVO" && (
                      <button onClick={() => inativar(r)} className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition">Inativar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        O "total gasto" é estimado casando o nome do fornecedor com o campo de fornecedor das Despesas — cadastre aqui com o mesmo nome usado ao lançar a despesa pra esse número ficar preciso.
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">{editing ? "Editar fornecedor" : "Novo fornecedor"}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Categoria</label>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ex: Design, Hospedagem…"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Contato</label>
                <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              {editing && (
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                  </select>
                </div>
              )}
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
