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

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// A client's own lead pipeline — a full drag-and-drop Kanban, same
// interaction model as the agency's own funil (LeadsKanban). Clients manage
// their own; staff (sócio, and the assigned gestor) can view + edit through
// the client detail page via canEdit.
export default function ClientLeadsBoard({ clientId, canEdit }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", contact: "", origin: "" });
  const [showNew, setShowNew] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = clientId ? `?clientId=${clientId}` : "";
      setLeads(await api(`/api/client-leads${qs}`));
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
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
      setShowNew(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function updateStatus(leadId, status) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === status) return;
    setSaving(true);
    try {
      await api(`/api/client-leads/${leadId}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openCard(l) {
    if (!canEdit) return;
    if (expandedId === l.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(l.id);
    setEditForm({ name: l.name, contact: l.contact || "", origin: l.origin || "", notes: l.notes || "" });
  }

  async function saveEdit(l) {
    try {
      await api(`/api/client-leads/${l.id}`, { method: "PATCH", body: editForm });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function removeLead(l) {
    if (!confirm(`Remover o lead "${l.name}"?`)) return;
    try {
      await api(`/api/client-leads/${l.id}`, { method: "DELETE" });
      setExpandedId(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-semibold text-sm text-ink">Meus leads</h2>
          <p className="text-[11px] text-inkfaint">Arraste os cartões entre as colunas para mudar a etapa do funil.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew((v) => !v)}
            className="bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-accentink shrink-0">
            {showNew ? "Cancelar" : "+ Novo lead"}
          </button>
        )}
      </div>

      {canEdit && showNew && (
        <form onSubmit={createLead} className="bg-surface border border-border rounded-xl p-3 shadow-sm flex flex-col sm:flex-row gap-2">
          <input required placeholder="Nome do lead" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <input placeholder="Contato" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
            className="w-full sm:w-36 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <input placeholder="Origem" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}
            className="w-full sm:w-36 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <button className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink shrink-0">Adicionar</button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 overflow-x-auto">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.status === stage.key);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOverStage(stage.key); } }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.key ? null : s))}
              onDrop={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOverStage(null);
                const leadId = e.dataTransfer.getData("text/plain");
                updateStatus(leadId, stage.key);
              }}
              className={`min-w-[170px] rounded-xl border p-2.5 transition ${
                dragOverStage === stage.key ? "border-accent bg-accentsoft/40" : "border-border bg-surface2/40"
              }`}
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint">{stage.label}</span>
                <span className="text-[10px] text-inkfaint mono">{stageLeads.length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {stageLeads.map((lead) => {
                  const expanded = expandedId === lead.id;
                  return (
                    <div
                      key={lead.id}
                      draggable={canEdit}
                      onDragStart={(e) => canEdit && e.dataTransfer.setData("text/plain", lead.id)}
                      className={`bg-surface border border-border rounded-lg shadow-sm transition overflow-hidden hover:border-accent/50 ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <button onClick={() => openCard(lead)} className={`w-full text-left p-2.5 ${!canEdit ? "cursor-default" : ""}`}>
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-accentsoft text-accent text-[9px] font-bold flex items-center justify-center mt-0.5">
                            {initials(lead.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-ink truncate">{lead.name}</div>
                            <div className="text-[10.5px] text-inkfaint truncate">{lead.origin || "origem não informada"}</div>
                            {lead.contact && <div className="text-[10.5px] text-inksoft truncate mono">{lead.contact}</div>}
                          </div>
                        </div>
                      </button>

                      {expanded && editForm && (
                        <div className="border-t border-border p-2.5 space-y-1.5 bg-surface2/60">
                          <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nome"
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface text-ink" />
                          <input value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} placeholder="Contato"
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface text-ink" />
                          <input value={editForm.origin} onChange={(e) => setEditForm({ ...editForm, origin: e.target.value })} placeholder="Origem"
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface text-ink" />
                          <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Observações" rows={2}
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface text-ink resize-y" />
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <button onClick={() => saveEdit(lead)} className="text-[11px] bg-accent text-white font-medium px-2.5 py-1 rounded-md hover:bg-accentink">
                              Salvar
                            </button>
                            <button onClick={() => removeLead(lead)} className="text-[11px] text-danger hover:underline">Remover</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!loading && leads.length === 0 && (
        <div className="text-center text-inkfaint text-sm py-6">Nenhum lead cadastrado ainda{canEdit ? " — adicione o primeiro acima." : "."}</div>
      )}
      {saving && <p className="text-[11px] text-inkfaint">Salvando…</p>}
    </div>
  );
}
