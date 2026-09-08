"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_CLASS } from "../../lib/adminFormat";

function emptyForm() {
  return { title: "", description: "", amount: "", area: "" };
}

export default function AdminAprovacoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/aprovacoes"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return alert("Informe o título da solicitação.");
    setSaving(true);
    try {
      await api("/api/admin/aprovacoes", {
        method: "POST",
        body: { title: form.title.trim(), description: form.description || null, amount: form.amount !== "" ? Number(form.amount) : null, area: form.area || null },
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

  async function decidir(a, status) {
    setBusyId(a.id);
    try {
      await api(`/api/admin/aprovacoes/${a.id}`, { method: "PATCH", body: { status, decisionNote: noteDraft[a.id] || null } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelar(a) {
    if (!confirm("Cancelar essa solicitação pendente?")) return;
    setBusyId(a.id);
    try {
      await api(`/api/admin/aprovacoes/${a.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pendentes = rows.filter((r) => r.status === "PENDENTE");
  const decididas = rows.filter((r) => r.status !== "PENDENTE");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-ink">Aprovações {pendentes.length > 0 && <span className="text-warning">({pendentes.length} pendente{pendentes.length > 1 ? "s" : ""})</span>}</h3>
        <button onClick={() => { setForm(emptyForm()); setShowForm(true); }} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Solicitar aprovação</button>
      </div>

      {loading && <div className="text-center text-sm text-inkfaint py-6">Carregando…</div>}
      {!loading && rows.length === 0 && <div className="text-center text-sm text-inkfaint py-6 bg-surface border border-border rounded-2xl">Nenhuma solicitação registrada ainda.</div>}

      <div className="space-y-2.5">
        {pendentes.map((a) => (
          <div key={a.id} className="bg-surface border border-warning/30 rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13.5px] text-ink font-medium">{a.title}</div>
                <div className="text-[11.5px] text-inkfaint">Pedido por {a.requestedBy} em {fmtDate(a.createdAt)}{a.area ? ` · ${a.area}` : ""}{a.amount != null ? ` · ${currency(a.amount)}` : ""}</div>
                {a.description && <div className="text-[12.5px] text-inksoft mt-1">{a.description}</div>}
              </div>
              <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${APPROVAL_STATUS_CLASS.PENDENTE}`}>{APPROVAL_STATUS_LABEL.PENDENTE}</span>
            </div>
            <input value={noteDraft[a.id] || ""} onChange={(e) => setNoteDraft({ ...noteDraft, [a.id]: e.target.value })} placeholder="observação da decisão (opcional)"
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent" />
            <div className="flex gap-2">
              <button disabled={busyId === a.id} onClick={() => decidir(a, "APROVADA")} className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Aprovar</button>
              <button disabled={busyId === a.id} onClick={() => decidir(a, "RECUSADA")} className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Recusar</button>
              <button disabled={busyId === a.id} onClick={() => cancelar(a)} className="text-[11.5px] font-medium px-3 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">Cancelar</button>
            </div>
          </div>
        ))}
      </div>

      {decididas.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                  <th className="px-4 py-2.5">Solicitação</th>
                  <th className="px-4 py-2.5">Pedido por</th>
                  <th className="px-4 py-2.5">Decidido por</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {decididas.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-ink">{a.title}{a.decisionNote && <div className="text-[11px] text-inkfaint">{a.decisionNote}</div>}</td>
                    <td className="px-4 py-2.5 text-inksoft">{a.requestedBy}</td>
                    <td className="px-4 py-2.5 text-inksoft">{a.decidedBy || "—"}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${APPROVAL_STATUS_CLASS[a.status]}`}>{APPROVAL_STATUS_LABEL[a.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">Solicitar aprovação</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Título *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor (opcional)</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Área (opcional)</label>
                  <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
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
