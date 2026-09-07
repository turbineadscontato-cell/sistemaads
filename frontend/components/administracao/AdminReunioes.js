"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/adminFormat";

function emptyForm() {
  return { date: new Date().toISOString().slice(0, 10), title: "", participants: "", notes: "", decisions: [{ description: "", responsible: "", dueDate: "" }] };
}

export default function AdminReunioes() {
  const [rows, setRows] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [newDecision, setNewDecision] = useState({ description: "", responsible: "", dueDate: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([api("/api/admin/reunioes"), api("/api/admin/reunioes/resumo")]);
      setRows(r);
      setResumo(s);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateDecision(i, patch) {
    setForm((f) => ({ ...f, decisions: f.decisions.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  }

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return alert("Preencha o título/pauta da reunião.");
    setSaving(true);
    try {
      await api("/api/admin/reunioes", {
        method: "POST",
        body: {
          date: form.date,
          title: form.title.trim(),
          participants: form.participants.split(",").map((p) => p.trim()).filter(Boolean),
          notes: form.notes || null,
          decisions: form.decisions.filter((d) => d.description.trim()),
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

  async function addDecision(meetingId) {
    if (!newDecision.description.trim()) return;
    setBusy(true);
    try {
      await api(`/api/admin/reunioes/${meetingId}/decisoes`, { method: "POST", body: newDecision });
      setNewDecision({ description: "", responsible: "", dueDate: "" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleDecision(meetingId, decision) {
    setBusy(true);
    try {
      await api(`/api/admin/reunioes/${meetingId}/decisoes/${decision.id}`, { method: "PATCH", body: { status: decision.status === "ABERTA" ? "CONCLUIDA" : "ABERTA" } });
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
      {resumo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
            <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Última reunião</div>
            {resumo.ultimaReuniao ? (
              <div className="mt-1">
                <div className="text-ink font-medium">{resumo.ultimaReuniao.title}</div>
                <div className="text-[12px] text-inkfaint">{fmtDate(resumo.ultimaReuniao.date)} · {resumo.ultimaReuniao.totalDecisoes} decisão(ões)</div>
              </div>
            ) : <div className="text-[13px] text-inkfaint mt-1">Nenhuma reunião registrada ainda.</div>}
          </div>
          <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
            <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Decisões em aberto</div>
            {resumo.decisoesAbertas.length === 0 && <div className="text-[13px] text-inkfaint mt-1">Nenhuma pendente.</div>}
            <div className="mt-1 space-y-1">
              {resumo.decisoesAbertas.slice(0, 4).map((d) => (
                <div key={d.id} className="text-[12.5px] text-inksoft">• {d.description}{d.responsible ? ` — ${d.responsible}` : ""}</div>
              ))}
              {resumo.decisoesAbertas.length > 4 && <div className="text-[11px] text-inkfaint">+{resumo.decisoesAbertas.length - 4} outra(s)</div>}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button onClick={() => { setForm(emptyForm()); setShowForm(true); }} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Nova reunião</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {loading && <div className="px-4 py-6 text-center text-sm text-inkfaint">Carregando…</div>}
        {!loading && rows.length === 0 && <div className="px-4 py-6 text-center text-sm text-inkfaint">Nenhuma reunião registrada ainda.</div>}
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <div>
                  <div className="text-[13.5px] text-ink font-medium">{r.title}</div>
                  <div className="text-[11.5px] text-inkfaint">{fmtDate(r.date)}{r.participants.length ? ` · ${r.participants.join(", ")}` : ""}</div>
                </div>
                <span className="text-[11px] text-inkfaint">{r.decisions.length} decisão(ões)</span>
              </div>
              {openId === r.id && (
                <div className="mt-3 bg-surface2 border border-border rounded-lg p-3 space-y-3">
                  {r.notes && <div className="text-[12.5px] text-inksoft whitespace-pre-wrap">{r.notes}</div>}
                  <div className="space-y-1.5">
                    {r.decisions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                        <span className={d.status === "CONCLUIDA" ? "text-inkfaint line-through" : "text-inksoft"}>{d.description}{d.responsible ? ` — ${d.responsible}` : ""}{d.dueDate ? ` (até ${fmtDate(d.dueDate)})` : ""}</span>
                        <button disabled={busy} onClick={() => toggleDecision(r.id, d)} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-lg bg-white/10 text-inksoft hover:text-ink transition shrink-0">{d.status === "ABERTA" ? "Concluir" : "Reabrir"}</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input value={newDecision.description} onChange={(e) => setNewDecision({ ...newDecision, description: e.target.value })} placeholder="nova decisão…"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent" />
                    <button disabled={busy} onClick={() => addDecision(r.id)} className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Adicionar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">Nova reunião de sócios</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Data *</label>
                  <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Participantes (vírgula)</label>
                  <input value={form.participants} onChange={(e) => setForm({ ...form, participants: e.target.value })} placeholder="Elismael, sócio 2"
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Título/pauta *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Ata / resumo</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase text-inkfaint">Decisões (opcional)</label>
                {form.decisions.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2">
                    <input value={d.description} onChange={(e) => updateDecision(i, { description: e.target.value })} placeholder="descrição da decisão"
                      className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                    <input value={d.responsible} onChange={(e) => updateDecision(i, { responsible: e.target.value })} placeholder="responsável"
                      className="w-28 bg-surface2 border border-border rounded-lg px-2 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                  </div>
                ))}
                <button type="button" onClick={() => setForm((f) => ({ ...f, decisions: [...f.decisions, { description: "", responsible: "", dueDate: "" }] }))}
                  className="text-[11.5px] font-medium text-inksoft hover:text-ink transition">+ adicionar decisão</button>
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
