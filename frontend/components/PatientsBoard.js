"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

// The therapist's own patient tracker, Trello-style: one column per stage,
// cards carry the essentials (próxima sessão, situação de pagamento) and
// expand into a full editor + a dated log of session/progress notes.
const STAGES = [
  { key: "avaliacao", label: "Avaliação" },
  { key: "acompanhamento", label: "Acompanhamento" },
  { key: "pausado", label: "Pausado" },
  { key: "encerrado", label: "Encerrado" },
];

const PAYMENT_LABEL = { EM_DIA: "Em dia", PENDENTE: "Pendente", ATRASADO: "Atrasado" };
const PAYMENT_CLASS = {
  EM_DIA: "bg-successsoft text-success",
  PENDENTE: "bg-warningsoft text-warning",
  ATRASADO: "bg-dangersoft text-danger",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-BR");
}
function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function currency(n) {
  if (n == null) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function toDateTimeLocal(d) {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const EMPTY_FORM = { name: "", contact: "", sessionValue: "", paymentDueDay: "", paymentStatus: "EM_DIA", nextSessionAt: "", notes: "" };

export default function PatientsBoard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [notesById, setNotesById] = useState({});
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    try {
      setPatients(await api("/api/patients"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPatient(e) {
    e.preventDefault();
    if (!newForm.name.trim()) return;
    try {
      await api("/api/patients", {
        method: "POST",
        body: {
          ...newForm,
          sessionValue: newForm.sessionValue || undefined,
          paymentDueDay: newForm.paymentDueDay || undefined,
          nextSessionAt: newForm.nextSessionAt || undefined,
        },
      });
      setNewForm(EMPTY_FORM);
      setShowNew(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function moveStage(patient, status) {
    try {
      await api(`/api/patients/${patient.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  function openCard(p) {
    if (expandedId === p.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(p.id);
    setEditForm({
      name: p.name,
      contact: p.contact || "",
      sessionValue: p.sessionValue ?? "",
      paymentDueDay: p.paymentDueDay ?? "",
      paymentStatus: p.paymentStatus,
      nextSessionAt: toDateTimeLocal(p.nextSessionAt),
      notes: p.notes || "",
    });
    if (!notesById[p.id]) loadNotes(p.id);
  }

  async function loadNotes(patientId) {
    try {
      const notes = await api(`/api/patients/${patientId}/notes`);
      setNotesById((n) => ({ ...n, [patientId]: notes }));
    } catch (err) {
      // silent
    }
  }

  async function saveEdit(p) {
    try {
      await api(`/api/patients/${p.id}`, {
        method: "PATCH",
        body: {
          ...editForm,
          sessionValue: editForm.sessionValue || null,
          paymentDueDay: editForm.paymentDueDay || null,
          nextSessionAt: editForm.nextSessionAt || null,
        },
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function removePatient(p) {
    if (!confirm(`Remover "${p.name}" da lista de pacientes? Os relatórios dele também serão apagados.`)) return;
    try {
      await api(`/api/patients/${p.id}`, { method: "DELETE" });
      setExpandedId(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function addNote(p) {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    try {
      await api(`/api/patients/${p.id}/notes`, { method: "POST", body: { content: noteDraft.trim() } });
      setNoteDraft("");
      loadNotes(p.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) return <div className="text-xs text-inkfaint">Carregando pacientes…</div>;
  if (error) return <div className="text-xs text-danger">{error}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-semibold text-base text-ink">Meus pacientes</h2>
          <p className="text-[11px] text-inkfaint">Organize seus pacientes por etapa — só você tem acesso a esses dados.</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)}
          className="bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-accentink shrink-0">
          {showNew ? "Cancelar" : "+ Novo paciente"}
        </button>
      </div>

      {showNew && (
        <form onSubmit={createPatient} className="bg-surface border border-border rounded-xl shadow-sm p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input required placeholder="Nome do paciente" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink sm:col-span-1" />
          <input placeholder="Contato (telefone/e-mail)" value={newForm.contact} onChange={(e) => setNewForm({ ...newForm, contact: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <input type="number" step="0.01" placeholder="Valor da sessão" value={newForm.sessionValue} onChange={(e) => setNewForm({ ...newForm, sessionValue: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
          <input type="number" min="1" max="31" placeholder="Dia de vencimento" value={newForm.paymentDueDay} onChange={(e) => setNewForm({ ...newForm, paymentDueDay: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
          <input type="datetime-local" value={newForm.nextSessionAt} onChange={(e) => setNewForm({ ...newForm, nextSessionAt: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
          <select value={newForm.paymentStatus} onChange={(e) => setNewForm({ ...newForm, paymentStatus: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
            {Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink sm:col-span-3">
            Adicionar paciente
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STAGES.map((stage) => {
          const items = patients.filter((p) => p.status === stage.key);
          return (
            <div key={stage.key} className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-border font-display font-semibold text-xs text-ink flex items-center justify-between">
                <span>{stage.label}</span>
                <span className="text-[10.5px] text-inkfaint mono">{items.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[60px]">
                {items.map((p) => {
                  const expanded = expandedId === p.id;
                  return (
                    <div key={p.id} className="border border-border rounded-lg bg-surface2 overflow-hidden">
                      <button onClick={() => openCard(p)} className="w-full text-left px-2.5 py-2">
                        <div className="text-sm text-ink font-medium truncate">{p.name}</div>
                        <div className="flex items-center flex-wrap gap-1.5 mt-1">
                          {p.nextSessionAt && (
                            <span className="text-[10px] mono text-inksoft">{fmtDateTime(p.nextSessionAt)}</span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PAYMENT_CLASS[p.paymentStatus]}`}>
                            {PAYMENT_LABEL[p.paymentStatus]}
                          </span>
                          {currency(p.sessionValue) && <span className="text-[10px] mono text-inkfaint">{currency(p.sessionValue)}</span>}
                        </div>
                      </button>

                      {expanded && editForm && (
                        <div className="border-t border-border p-2.5 space-y-2 bg-surface">
                          <div className="flex flex-wrap gap-1">
                            {STAGES.filter((s) => s.key !== p.status).map((s) => (
                              <button key={s.key} onClick={() => moveStage(p, s.key)}
                                className="text-[10.5px] px-2 py-1 rounded-md border border-border text-inksoft hover:text-accent hover:border-accent">
                                → {s.label}
                              </button>
                            ))}
                          </div>

                          <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nome"
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink" />
                          <input value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} placeholder="Contato"
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink" />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input type="number" step="0.01" value={editForm.sessionValue} onChange={(e) => setEditForm({ ...editForm, sessionValue: e.target.value })} placeholder="Valor sessão"
                              className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                            <input type="number" min="1" max="31" value={editForm.paymentDueDay} onChange={(e) => setEditForm({ ...editForm, paymentDueDay: e.target.value })} placeholder="Dia vencimento"
                              className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input type="datetime-local" value={editForm.nextSessionAt} onChange={(e) => setEditForm({ ...editForm, nextSessionAt: e.target.value })}
                              className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                            <select value={editForm.paymentStatus} onChange={(e) => setEditForm({ ...editForm, paymentStatus: e.target.value })}
                              className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink">
                              {Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Observações gerais" rows={2}
                            className="w-full px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink resize-y" />
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => saveEdit(p)} className="text-[11px] bg-accent text-white font-medium px-2.5 py-1 rounded-md hover:bg-accentink">
                              Salvar
                            </button>
                            <button onClick={() => removePatient(p)} className="text-[11px] text-danger hover:underline">Remover paciente</button>
                          </div>

                          <div className="border-t border-border pt-2 space-y-1.5">
                            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-inkfaint">Relatórios / sessões</div>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                              {(notesById[p.id] || []).map((n) => (
                                <div key={n.id} className="text-[11px] bg-surface2 border border-border rounded-md px-2 py-1.5">
                                  <div className="text-[10px] text-inkfaint mono">{fmtDateTime(n.createdAt)}</div>
                                  <div className="text-ink whitespace-pre-wrap mt-0.5">{n.content}</div>
                                </div>
                              ))}
                              {(notesById[p.id] || []).length === 0 && <div className="text-[10.5px] text-inkfaint">Nenhum relatório ainda.</div>}
                            </div>
                            <div className="flex gap-1.5">
                              <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Nova anotação de sessão…"
                                className="flex-1 px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink" />
                              <button onClick={() => addNote(p)} disabled={savingNote}
                                className="text-[11px] bg-accent text-white font-medium px-2.5 rounded-md hover:bg-accentink disabled:opacity-60">
                                {savingNote ? "…" : "Add"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-[10.5px] text-inkfaint text-center py-3">Vazio</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
