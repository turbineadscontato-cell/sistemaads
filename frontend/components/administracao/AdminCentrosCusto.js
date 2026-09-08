"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

function emptyForm() {
  return { name: "", notes: "" };
}

export default function AdminCentrosCusto() {
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
      setRows(await api("/api/admin/centros-custo"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(r) { setEditing(r); setForm({ name: r.name, notes: r.notes || "" }); setShowForm(true); }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Preencha o nome do centro de custo.");
    setSaving(true);
    const body = { name: form.name.trim(), notes: form.notes || null };
    try {
      if (editing) await api(`/api/admin/centros-custo/${editing.id}`, { method: "PATCH", body });
      else await api("/api/admin/centros-custo", { method: "POST", body });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function inativar(r) {
    if (!confirm(`Inativar o centro de custo "${r.name}"?`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/centros-custo/${r.id}`, { method: "DELETE" });
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
        <p className="text-[11.5px] text-inkfaint max-w-md">
          Cadastro próprio de centros de custo. O "total gasto" é estimado casando o nome aqui com o campo "centro de custo" já usado em Despesas.
        </p>
        <button onClick={openNew} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Novo centro de custo</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Centro de custo</th>
                <th className="px-4 py-2.5">Total gasto</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={4} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={4} className="px-4 py-6 text-center text-inkfaint">Nenhum centro de custo cadastrado ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border cursor-pointer hover:bg-white/[0.03] transition" onClick={() => openEdit(r)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 mono text-ink">{currency(r.totalGasto)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${r.status === "ATIVO" ? "bg-successsoft text-success" : "bg-white/5 text-inkfaint line-through"}`}>{r.status === "ATIVO" ? "Ativo" : "Inativo"}</span>
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {r.status === "ATIVO" && (
                      <button disabled={busyId === r.id} onClick={() => inativar(r)}
                        className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Inativar</button>
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
              <h3 className="font-display font-semibold text-ink">{editing ? "Editar centro de custo" : "Novo centro de custo"}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Tráfego pago, Equipe, Ferramentas"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                <p className="text-[10.5px] text-inkfaint mt-1">Use o mesmo nome no campo "centro de custo" das despesas pra entrar no total.</p>
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
