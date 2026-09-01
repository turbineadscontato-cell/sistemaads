"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

const STAGES = [
  { key: "novo", label: "Novo" },
  { key: "contato", label: "Em contato" },
  { key: "proposta", label: "Proposta" },
  { key: "fechado", label: "Fechado" },
  { key: "perdido", label: "Perdido" },
];

// A client's own lead pipeline. Clients manage their own; staff (sócio, and
// the assigned gestor) can view + edit through the client detail page.
export default function ClientLeadsBoard({ clientId, canEdit }) {
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState({ name: "", contact: "", origin: "" });

  const load = useCallback(async () => {
    try {
      const qs = clientId ? `?clientId=${clientId}` : "";
      setLeads(await api(`/api/client-leads${qs}`));
    } catch (err) {
      // silent
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createLead(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api("/api/client-leads", { method: "POST", body: { ...form, clientId } });
      setForm({ name: "", contact: "", origin: "" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function updateStatus(lead, status) {
    try {
      await api(`/api/client-leads/${lead.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Meus leads</div>
      {canEdit && (
        <form onSubmit={createLead} className="flex flex-col sm:flex-row gap-2 p-3 border-b border-border">
          <input required placeholder="Nome do lead" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <input placeholder="Contato" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
            className="w-full sm:w-32 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <input placeholder="Origem" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}
            className="w-full sm:w-32 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <button className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink shrink-0">Adicionar</button>
        </form>
      )}
      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {leads.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="text-ink truncate">{l.name}</div>
              <div className="text-[10.5px] text-inkfaint truncate">{l.contact || "sem contato"}{l.origin ? ` · ${l.origin}` : ""}</div>
            </div>
            {canEdit ? (
              <select value={l.status} onChange={(e) => updateStatus(l, e.target.value)}
                className="text-xs px-2 py-1 rounded-md border border-border bg-surface2 text-ink shrink-0">
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            ) : (
              <span className="text-xs text-inksoft shrink-0">{STAGES.find((s) => s.key === l.status)?.label || l.status}</span>
            )}
          </div>
        ))}
        {leads.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Nenhum lead cadastrado ainda.</div>}
      </div>
    </div>
  );
}
