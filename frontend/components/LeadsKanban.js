"use client";

import { useState } from "react";
import { api } from "../lib/api";

export const STAGES = [
  { key: "novo", label: "Novo", tone: "accent" },
  { key: "contato", label: "Em contato", tone: "warning" },
  { key: "reuniao", label: "Reunião marcada", tone: "accent" },
  { key: "proposta", label: "Proposta enviada", tone: "warning" },
  { key: "fechado", label: "Fechado", tone: "success" },
  { key: "perdido", label: "Perdido", tone: "danger" },
];

const TONE_CLS = {
  accent: { header: "bg-accentsoft/60 border-accent/20", dot: "bg-accent", pill: "bg-accentsoft text-accent", bar: "bg-accent" },
  warning: { header: "bg-warningsoft/60 border-warning/20", dot: "bg-warning", pill: "bg-warningsoft text-warning", bar: "bg-warning" },
  success: { header: "bg-successsoft/60 border-success/20", dot: "bg-success", pill: "bg-successsoft text-success", bar: "bg-success" },
  danger: { header: "bg-dangersoft/60 border-danger/20", dot: "bg-danger", pill: "bg-dangersoft text-danger", bar: "bg-danger" },
};

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function LeadsKanban({ leads, onChange, loading }) {
  const [newLead, setNewLead] = useState({ name: "", contact: "", origin: "" });
  const [showNew, setShowNew] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function createLead(e) {
    e.preventDefault();
    if (!newLead.name.trim()) return;
    try {
      await api("/api/leads", { method: "POST", body: newLead });
      setNewLead({ name: "", contact: "", origin: "" });
      setShowNew(false);
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

  function openLead(lead) {
    setOpenId(lead.id);
    setEditForm({ name: lead.name, contact: lead.contact || "", origin: lead.origin || "", notes: lead.notes || "", status: lead.status });
  }

  async function saveLead() {
    if (!openId) return;
    setSavingEdit(true);
    try {
      await api(`/api/leads/${openId}`, { method: "PATCH", body: editForm });
      onChange();
      setOpenId(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteLead() {
    const lead = leads.find((l) => l.id === openId);
    if (!lead) return;
    if (!confirm(`Excluir o lead "${lead.name}" do funil? Não pode ser desfeito.`)) return;
    try {
      await api(`/api/leads/${openId}`, { method: "DELETE" });
      setOpenId(null);
      onChange();
    } catch (err) {
      alert(err.message);
    }
  }

  const openLeadData = openId ? leads.find((l) => l.id === openId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-inkfaint">
          Arraste os cartões entre as colunas — ou toque num cartão pra abrir e mudar a etapa manualmente.{saving ? " Salvando…" : ""}
        </p>
        <button onClick={() => setShowNew((v) => !v)}
          className="shrink-0 bg-accent text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-accentink transition shadow-[0_6px_16px_-6px_rgba(255,122,26,0.5)]">
          {showNew ? "Cancelar" : "+ Novo lead"}
        </button>
      </div>

      {showNew && (
        <form onSubmit={createLead} className="bg-surface border border-border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[11px] text-inkfaint mb-1">Nome do lead</label>
            <input required autoFocus value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
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
          <button className="lg:col-span-4 bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink transition">Adicionar lead</button>
        </form>
      )}

      {/* Blocos do funil — premium: colunas mais largas, cabeçalho colorido
          por etapa, cartões maiores com barra de cor lateral. */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {STAGES.map((stage) => {
          const tone = TONE_CLS[stage.tone];
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
              className={`shrink-0 w-[248px] rounded-2xl border transition ${
                dragOverStage === stage.key ? "border-accent bg-accentsoft/30 shadow-lg" : "border-border bg-surface2/30"
              }`}
            >
              <div className={`flex items-center justify-between px-3.5 py-3 rounded-t-2xl border-b ${tone.header}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                  <span className="text-[12px] font-semibold text-ink">{stage.label}</span>
                </div>
                <span className="text-[10.5px] font-bold text-inkfaint mono bg-surface/70 px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
              </div>
              <div className="p-2.5 space-y-2.5 min-h-[64px]">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                    onClick={() => openLead(lead)}
                    className="group relative bg-surface border border-border rounded-xl pl-3.5 pr-3 py-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-accent/50 hover:shadow-md transition overflow-hidden"
                  >
                    <span className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`} />
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-accentsoft text-accent text-[11px] font-bold flex items-center justify-center mt-0.5">
                        {initials(lead.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink truncate">{lead.name}</div>
                        <div className="text-[11px] text-inkfaint truncate">{lead.origin || "origem não informada"}</div>
                        {lead.contact && <div className="text-[11px] text-inksoft truncate mono mt-0.5">{lead.contact}</div>}
                      </div>
                    </div>
                    {lead.meetings?.length > 0 && (
                      <div className="mt-2 text-[10px] text-accent font-medium flex items-center gap-1">
                        📅 {lead.meetings.length} reunião(ões)
                      </div>
                    )}
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div className="text-center text-[11px] text-inkfaint py-4">Vazio</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!loading && leads.length === 0 && (
        <div className="text-center text-inkfaint text-sm py-6">Nenhum lead cadastrado ainda — adicione o primeiro acima.</div>
      )}

      {/* Popup de edição — abre ao tocar/clicar num cartão. */}
      {openId && editForm && openLeadData && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div onClick={() => setOpenId(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border">
              <div className="min-w-0 flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-full bg-accentsoft text-accent text-sm font-bold flex items-center justify-center">
                  {initials(editForm.name)}
                </span>
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-wider text-inkfaint">Lead</div>
                  <h3 className="font-display font-semibold text-lg text-ink truncate">{editForm.name || "—"}</h3>
                </div>
              </div>
              <button onClick={() => setOpenId(null)} aria-label="Fechar"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-inksoft hover:text-ink hover:bg-white/5 transition">✕</button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-[11px] text-inkfaint mb-1.5">Etapa do funil</label>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map((s) => {
                    const tone = TONE_CLS[s.tone];
                    const active = editForm.status === s.key;
                    return (
                      <button key={s.key} type="button"
                        onClick={() => setEditForm({ ...editForm, status: s.key })}
                        className={`text-[12px] px-2.5 py-1.5 rounded-lg border font-medium transition ${active ? `${tone.pill} border-transparent` : "border-border text-inksoft hover:border-accent hover:text-ink"}`}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1.5">Nome</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1.5">Contato</label>
                  <input value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                    placeholder="WhatsApp" className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface2 text-ink" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-inkfaint mb-1.5">Origem</label>
                  <input value={editForm.origin} onChange={(e) => setEditForm({ ...editForm, origin: e.target.value })}
                    placeholder="Instagram, indicação..." className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface2 text-ink" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-inkfaint mb-1.5">Observações</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3}
                  placeholder="Anotações sobre a conversa, próximos passos..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface2 text-ink resize-y" />
              </div>

              {openLeadData.meetings?.length > 0 && (
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1.5">Reuniões vinculadas</label>
                  <div className="space-y-1.5">
                    {openLeadData.meetings.map((m) => (
                      <div key={m.id} className="text-[11.5px] text-inksoft bg-surface2/60 border border-border rounded-lg px-2.5 py-1.5">
                        {new Date(m.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {m.status}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button onClick={deleteLead} className="text-[12.5px] text-danger hover:underline font-medium">Excluir lead</button>
                <div className="flex gap-2">
                  <button onClick={() => setOpenId(null)} className="text-xs text-inkfaint hover:text-ink px-3 py-2">Cancelar</button>
                  <button onClick={saveLead} disabled={savingEdit}
                    className="bg-accent text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-accentink disabled:opacity-60 transition">
                    {savingEdit ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
