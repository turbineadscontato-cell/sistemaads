"use client";

import { useState } from "react";
import { api } from "../lib/api";

export const STAGES = [
  { key: "novo", label: "Novo" },
  { key: "contato", label: "Em contato" },
  { key: "reuniao", label: "Reunião marcada" },
  { key: "proposta", label: "Proposta enviada" },
  { key: "fechado", label: "Fechado" },
  { key: "perdido", label: "Perdido" },
];

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function LeadsKanban({ leads, onChange, loading }) {
  const [newLead, setNewLead] = useState({ name: "", contact: "", origin: "" });
  const [dragOverStage, setDragOverStage] = useState(null);
  const [saving, setSaving] = useState(false);

  async function createLead(e) {
    e.preventDefault();
    if (!newLead.name.trim()) return;
    try {
      await api("/api/leads", { method: "POST", body: newLead });
      setNewLead({ name: "", contact: "", origin: "" });
      onChange();
    } catch (err) {
      alert(err.message);
    }
  }

  async function moveLead(leadId, status) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === status) return;
    setSaving(true);
    try {
      await api(`/api/leads/${leadId}`, { method: "PATCH", body: { status } });
      onChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={createLead} className="bg-surface border border-border rounded-xl p-4 shadow-sm grid grid-cols-5 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-[11px] text-inkfaint mb-1">Nome do lead</label>
          <input required value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Contato</label>
          <input value={newLead.contact} onChange={(e) => setNewLead({ ...newLead, contact: e.target.value })}
            placeholder="WhatsApp" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Origem</label>
          <input value={newLead.origin} onChange={(e) => setNewLead({ ...newLead, origin: e.target.value })}
            placeholder="Instagram" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>
        <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink transition">Adicionar lead</button>
      </form>

      <div className="grid grid-cols-6 gap-3 overflow-x-auto">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.status === stage.key);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key); }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.key ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const leadId = e.dataTransfer.getData("text/plain");
                moveLead(leadId, stage.key);
              }}
              className={`min-w-[180px] rounded-xl border p-2.5 transition ${
                dragOverStage === stage.key ? "border-accent bg-accentsoft/40" : "border-border bg-surface2/40"
              }`}
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint">{stage.label}</span>
                <span className="text-[10px] text-inkfaint mono">{stageLeads.length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                    className="bg-surface border border-border rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-accent/50 transition"
                  >
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
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!loading && leads.length === 0 && (
        <div className="text-center text-inkfaint text-sm py-6">Nenhum lead cadastrado ainda — adicione o primeiro acima.</div>
      )}
      <p className="text-[11px] text-inkfaint">Arraste os cartões entre as colunas para mudar a etapa do funil.{saving ? " Salvando…" : ""}</p>
    </div>
  );
}
