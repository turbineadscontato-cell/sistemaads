"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDate, PROCESS_TYPE_OPTIONS, PROCESS_TYPE_LABEL } from "../../lib/adminFormat";

function emptyForm() {
  return { type: PROCESS_TYPE_OPTIONS[0].value, subjectName: "", notes: "" };
}

export default function AdminProcessos() {
  const [rows, setRows] = useState([]);
  const [modelos, setModelos] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [items, setItems] = useState(null); // null = usar modelo padrão do tipo
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, mods] = await Promise.all([
        api(`/api/admin/processos${filterType ? `?type=${filterType}` : ""}`),
        api("/api/admin/processos/modelos"),
      ]);
      setRows(list);
      setModelos(mods);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm(emptyForm());
    setItems(null);
    setShowForm(true);
  }

  const currentItems = items !== null ? items : (modelos[form.type] || []);

  function updateItem(i, value) {
    setItems(currentItems.map((it, idx) => (idx === i ? value : it)));
  }
  function removeItem(i) {
    setItems(currentItems.filter((_, idx) => idx !== i));
  }
  function addItem() {
    setItems([...currentItems, ""]);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.subjectName.trim()) return alert("Informe o nome (cliente ou funcionário).");
    setSaving(true);
    try {
      await api("/api/admin/processos", {
        method: "POST",
        body: { type: form.type, subjectName: form.subjectName.trim(), notes: form.notes || null, items: currentItems.filter((i) => i.trim()) },
      });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(checklistId, item) {
    setBusy(true);
    try {
      await api(`/api/admin/processos/${checklistId}/itens/${item.id}`, { method: "PATCH", body: { done: !item.done } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addChecklistItem(checklistId) {
    if (!newItem.trim()) return;
    setBusy(true);
    try {
      await api(`/api/admin/processos/${checklistId}/itens`, { method: "POST", body: { title: newItem.trim() } });
      setNewItem("");
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function excluirChecklist(c) {
    if (!confirm(`Excluir o checklist de "${c.subjectName}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/processos/${c.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const open = rows.find((r) => r.id === openId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          <option value="">Todos os tipos</option>
          {PROCESS_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={openNew} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Novo checklist</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {loading && <div className="px-4 py-6 text-center text-sm text-inkfaint">Carregando…</div>}
        {!loading && rows.length === 0 && <div className="px-4 py-6 text-center text-sm text-inkfaint">Nenhum checklist criado ainda.</div>}
        <div className="divide-y divide-border">
          {rows.map((c) => {
            const done = c.items.filter((i) => i.done).length;
            const total = c.items.length;
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  <div>
                    <div className="text-[13.5px] text-ink font-medium">{c.subjectName}</div>
                    <div className="text-[11.5px] text-inkfaint">{PROCESS_TYPE_LABEL[c.type]} · criado em {fmtDate(c.createdAt)} por {c.createdBy}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold ${done === total && total > 0 ? "text-success" : "text-inkfaint"}`}>{done}/{total}</span>
                    <button onClick={(e) => { e.stopPropagation(); excluirChecklist(c); }} className="text-[10.5px] text-danger hover:brightness-95">Excluir</button>
                  </div>
                </div>
                {openId === c.id && (
                  <div className="mt-3 bg-surface2 border border-border rounded-lg p-3 space-y-2">
                    {c.notes && <div className="text-[12.5px] text-inksoft whitespace-pre-wrap">{c.notes}</div>}
                    {c.items.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                        <input type="checkbox" checked={it.done} disabled={busy} onChange={() => toggleItem(c.id, it)} className="accent-accent" />
                        <span className={it.done ? "text-inkfaint line-through" : "text-inksoft"}>{it.title}</span>
                      </label>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="novo item…"
                        className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent" />
                      <button disabled={busy} onClick={() => addChecklistItem(c.id)} className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Adicionar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">Novo checklist</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Tipo *</label>
                <select value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value }); setItems(null); }}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                  {PROCESS_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome (cliente ou funcionário) *</label>
                <input required value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase text-inkfaint">Itens do checklist</label>
                {currentItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={it} onChange={(e) => updateItem(i, e.target.value)}
                      className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-accent" />
                    <button type="button" onClick={() => removeItem(i)} className="text-[11px] text-danger hover:brightness-95 px-1">remover</button>
                  </div>
                ))}
                <button type="button" onClick={addItem} className="text-[11.5px] font-medium text-inksoft hover:text-ink transition">+ adicionar item</button>
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
