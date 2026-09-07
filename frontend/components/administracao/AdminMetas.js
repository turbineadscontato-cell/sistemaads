"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, GOAL_TYPE_OPTIONS, GOAL_STATUS_LABEL, GOAL_STATUS_CLASS } from "../../lib/adminFormat";

function emptyForm() {
  return { title: "", type: "RECEITA", targetValue: "", targetMonth: "", notes: "" };
}

export default function AdminMetas() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/metas"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.targetValue) return alert("Preencha título e valor-alvo.");
    setSaving(true);
    try {
      await api("/api/admin/metas", { method: "POST", body: { title: form.title.trim(), type: form.type, targetValue: Number(form.targetValue), targetMonth: form.targetMonth || null, notes: form.notes || null } });
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(g, status) {
    setBusyId(g.id);
    try {
      await api(`/api/admin/metas/${g.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(g) {
    if (!confirm(`Remover a meta "${g.title}"?`)) return;
    setBusyId(g.id);
    try {
      await api(`/api/admin/metas/${g.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={() => { setForm(emptyForm()); setShowForm(true); }} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Nova meta</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && <div className="text-sm text-inkfaint">Carregando…</div>}
        {!loading && rows.length === 0 && <div className="text-sm text-inkfaint">Nenhuma meta cadastrada ainda.</div>}
        {rows.map((g) => (
          <div key={g.id} className="bg-surface border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13.5px] text-ink font-medium">{g.title}</div>
              <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${GOAL_STATUS_CLASS[g.status]}`}>{GOAL_STATUS_LABEL[g.status]}</span>
            </div>
            <div className="text-[11px] text-inkfaint">{GOAL_TYPE_OPTIONS.find((t) => t.value === g.type)?.label || g.type}{g.targetMonth ? ` · ${g.targetMonth}` : ""}</div>
            <div className="text-lg font-display font-semibold mono text-ink">{currency(g.targetValue)}</div>
            {g.notes && <div className="text-[12px] text-inksoft">{g.notes}</div>}
            <div className="flex items-center gap-1.5 pt-1">
              {g.status === "EM_ANDAMENTO" && (
                <>
                  <button disabled={busyId === g.id} onClick={() => setStatus(g, "ATINGIDA")} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Marcar atingida</button>
                  <button disabled={busyId === g.id} onClick={() => setStatus(g, "NAO_ATINGIDA")} className="text-[11px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Não atingida</button>
                </>
              )}
              <button disabled={busyId === g.id} onClick={() => remove(g)} className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60 ml-auto">Remover</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">Nova meta</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Título *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex: Faturar R$50.000 em setembro"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Tipo</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {GOAL_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor-alvo (R$) *</label>
                  <input required type="number" step="0.01" min="0.01" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Mês-alvo</label>
                <input type="month" value={form.targetMonth} onChange={(e) => setForm({ ...form, targetMonth: e.target.value })}
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
