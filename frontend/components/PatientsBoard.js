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

// Weekly recurring attendance days — 0=domingo ... 6=sábado, matching the
// backend's `weekdays` field. Drives the "Agenda semanal" drag-and-drop board.
const WEEKDAYS = [
  { key: 0, label: "Dom" },
  { key: 1, label: "Seg" },
  { key: 2, label: "Ter" },
  { key: 3, label: "Qua" },
  { key: 4, label: "Qui" },
  { key: 5, label: "Sex" },
  { key: 6, label: "Sáb" },
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
// Package-schedule dates are computed and stored as UTC-midnight-based
// "calendar dates" (see backend/src/utils/sessionSchedule.js) — reading them
// back with getFullYear/getMonth/getDate (local time) would shift the date
// by a day whenever the browser's timezone isn't UTC+0. UTC getters/setters
// keep it exactly the calendar date that was typed in, everywhere.
function toDateOnly(d) {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function fmtWeekday(d) {
  if (!d) return "";
  const label = new Date(d).toLocaleDateString("pt-BR", { weekday: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}
// UTC-forced variants used specifically for the computed session-package
// dates below, so what's shown always matches what was configured, instead
// of being reinterpreted in whatever timezone the viewer's browser is in.
function fmtScheduleWeekday(d) {
  if (!d) return "";
  const label = new Date(d).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}
function fmtScheduleDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
// Live, client-side mirror of backend/src/utils/sessionSchedule.js — computes
// the package preview from whatever is currently typed in the edit form
// (weekdays, horário, data de início, quantidade), even before it's saved.
// This is what makes the preview list react immediately when the professional
// sets the horário, instead of only updating after clicking Salvar + reload.
// Same UTC-only rule as the backend version, for the same reason: the date
// input is a plain "YYYY-MM-DD" value, always parsed as UTC midnight.
function computeScheduleClientSide(form) {
  const total = Number(form.packageTotalSessions);
  const weekdays = form.weekdays || [];
  if (!total || total <= 0 || weekdays.length === 0 || !form.packageStartDate) return null;

  const cursor = new Date(form.packageStartDate);
  cursor.setUTCHours(0, 0, 0, 0);

  let hours = null;
  let minutes = 0;
  if (form.sessionTime && /^\d{1,2}:\d{2}$/.test(form.sessionTime)) {
    const [h, m] = form.sessionTime.split(":").map(Number);
    hours = h;
    minutes = m;
  }

  const marked = new Set(weekdays);
  const dates = [];
  let guard = 0;
  while (dates.length < total && guard < 3650) {
    if (marked.has(cursor.getUTCDay())) {
      const d = new Date(cursor);
      if (hours != null) d.setUTCHours(hours, minutes, 0, 0);
      dates.push(d.toISOString());
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }

  const now = new Date();
  const completed = dates.filter((d) => new Date(d) < now).length;
  return { total, dates, completed };
}

const EMPTY_FORM = { name: "", contact: "", sessionValue: "", paymentDueDay: "", paymentStatus: "EM_DIA", nextSessionAt: "", notes: "", weekdays: [], sessionTime: "" };

function toggleDay(list, day) {
  return list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort();
}

export default function PatientsBoard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("status"); // status | agenda
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [notesById, setNotesById] = useState({});
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [activitiesById, setActivitiesById] = useState({});
  const [activityDraft, setActivityDraft] = useState({ title: "", dueDate: "" });
  const [savingActivity, setSavingActivity] = useState(false);
  const [editingMeetLink, setEditingMeetLink] = useState(false);

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
          sessionTime: newForm.sessionTime || undefined,
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

  // Drag-and-drop between day columns in the weekly agenda. Dropping a card
  // on a new day removes it from the day it was dragged out of (fromDay, or
  // null when dragged in fresh from nowhere in particular) and adds the
  // dropped-on day — a patient can still attend more than one day a week,
  // this just makes moving a single day painless.
  async function moveDay(patientId, fromDay, toDay) {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    const current = patient.weekdays || [];
    if (fromDay === toDay) return;
    let next = fromDay != null ? current.filter((d) => d !== fromDay) : current.slice();
    if (!next.includes(toDay)) next = [...next, toDay].sort();
    setMovingId(patientId);
    try {
      await api(`/api/patients/${patientId}`, { method: "PATCH", body: { weekdays: next } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setMovingId(null);
    }
  }

  async function removeDay(patientId, day) {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    const next = (patient.weekdays || []).filter((d) => d !== day);
    try {
      await api(`/api/patients/${patientId}`, { method: "PATCH", body: { weekdays: next } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  function printReport(p) {
    const notes = notesById[p.id] || [];
    const win = window.open("", "_blank", "width=680,height=800");
    if (!win) return;
    const daysLabel = (p.weekdays || []).map((d) => WEEKDAYS.find((w) => w.key === d)?.label).filter(Boolean).join(", ") || "—";
    win.document.write(`
      <html>
        <head>
          <title>Relatório — ${p.name}</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Arial, sans-serif; color: #111; padding: 32px; max-width: 640px; margin: 0 auto; }
            h1 { font-size: 18px; margin-bottom: 2px; }
            .meta { color: #555; font-size: 12px; margin-bottom: 18px; }
            .meta span { display: inline-block; margin-right: 14px; }
            .note { border-top: 1px solid #ddd; padding: 10px 0; }
            .note .date { font-size: 11px; color: #777; font-family: monospace; }
            .note .content { margin-top: 3px; white-space: pre-wrap; }
            .empty { color: #888; font-size: 13px; padding: 12px 0; }
          </style>
        </head>
        <body>
          <h1>${p.name}</h1>
          <div class="meta">
            <span>Situação: ${p.status}</span>
            <span>Pagamento: ${PAYMENT_LABEL[p.paymentStatus] || p.paymentStatus}</span>
            <span>Dias de atendimento: ${daysLabel}${p.sessionTime ? " às " + p.sessionTime : ""}</span>
          </div>
          ${notes.length === 0 ? '<div class="empty">Nenhum relatório registrado ainda.</div>' : notes.map((n) => `
            <div class="note">
              <div class="date">${fmtDateTime(n.createdAt)}</div>
              <div class="content">${(n.content || "").replace(/</g, "&lt;")}</div>
            </div>
          `).join("")}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
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
      weekdays: p.weekdays || [],
      sessionTime: p.sessionTime || "",
      meetLink: p.meetLink || "",
      packageTotalSessions: p.packageTotalSessions ?? "",
      packageStartDate: toDateOnly(p.packageStartDate) || toDateOnly(p.createdAt),
    });
    setEditingMeetLink(false);
    setActivityDraft({ title: "", dueDate: "" });
    if (!notesById[p.id]) loadNotes(p.id);
    if (!activitiesById[p.id]) loadActivities(p.id);
  }

  async function loadNotes(patientId) {
    try {
      const notes = await api(`/api/patients/${patientId}/notes`);
      setNotesById((n) => ({ ...n, [patientId]: notes }));
    } catch (err) {
      // silent
    }
  }

  async function loadActivities(patientId) {
    try {
      const activities = await api(`/api/patients/${patientId}/activities`);
      setActivitiesById((m) => ({ ...m, [patientId]: activities }));
    } catch (err) {
      // silent
    }
  }

  async function addActivity(p) {
    if (!activityDraft.title.trim()) return;
    setSavingActivity(true);
    try {
      await api(`/api/patients/${p.id}/activities`, {
        method: "POST",
        body: { title: activityDraft.title.trim(), dueDate: activityDraft.dueDate || undefined },
      });
      setActivityDraft({ title: "", dueDate: "" });
      loadActivities(p.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingActivity(false);
    }
  }

  async function toggleActivity(p, activity) {
    try {
      await api(`/api/patients/${p.id}/activities/${activity.id}`, {
        method: "PATCH",
        body: { status: activity.status === "concluida" ? "pendente" : "concluida" },
      });
      loadActivities(p.id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteActivity(p, activityId) {
    try {
      await api(`/api/patients/${p.id}/activities/${activityId}`, { method: "DELETE" });
      loadActivities(p.id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function respondRequest(p, approve) {
    try {
      await api(`/api/patients/${p.id}`, { method: "PATCH", body: approve ? { approveRequest: true } : { declineRequest: true } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleNoteVisibility(p, note) {
    try {
      await api(`/api/patients/${p.id}/notes/${note.id}`, { method: "PATCH", body: { visibleToPatient: !note.visibleToPatient } });
      loadNotes(p.id);
    } catch (err) {
      alert(err.message);
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
          sessionTime: editForm.sessionTime || null,
          meetLink: editForm.meetLink || null,
          packageTotalSessions: editForm.packageTotalSessions || null,
          packageStartDate: editForm.packageStartDate || null,
        },
      });
      setEditingMeetLink(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  // Opens a fresh Google Meet instant-meeting room in a new tab — Meet
  // generates the room itself (no API/OAuth needed on our side); the
  // professional copies that generated link back into the field below so it
  // becomes this patient's fixed session link for both sides to reuse.
  function generateMeetLink() {
    window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
    setEditingMeetLink(true);
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

      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setView("status")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${view === "status" ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}
        >
          Por etapa
        </button>
        <button
          onClick={() => setView("agenda")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${view === "agenda" ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}
        >
          Agenda semanal
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
          <input type="time" value={newForm.sessionTime} onChange={(e) => setNewForm({ ...newForm, sessionTime: e.target.value })}
            placeholder="Horário" className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
          <div className="sm:col-span-3">
            <label className="block text-[11px] text-inkfaint mb-1">Dias de atendimento (semana)</label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button type="button" key={d.key} onClick={() => setNewForm({ ...newForm, weekdays: toggleDay(newForm.weekdays, d.key) })}
                  className={`text-[10.5px] px-2 py-1 rounded-md border font-medium ${newForm.weekdays.includes(d.key) ? "bg-accent border-accent text-white" : "border-border text-inksoft hover:border-accent"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <button className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink sm:col-span-3">
            Adicionar paciente
          </button>
        </form>
      )}

      {view === "status" && (
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
                          {p.requestedSessionAt && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-warningsoft text-warning">pedido de remarcação</span>
                          )}
                        </div>
                      </button>

                      {expanded && editForm && (
                        <div className="border-t border-border p-2.5 space-y-2 bg-surface">
                          {p.requestedSessionAt && (
                            <div className="bg-warningsoft border border-warning/30 rounded-md px-2.5 py-2 space-y-1.5">
                              <div className="text-[10.5px] font-semibold text-warning">Pedido de remarcação do paciente</div>
                              <div className="text-[11px] text-ink">Novo horário sugerido: <span className="mono">{fmtDateTime(p.requestedSessionAt)}</span></div>
                              {p.requestNote && <div className="text-[10.5px] text-inksoft">"{p.requestNote}"</div>}
                              <div className="flex gap-3 pt-0.5">
                                <button onClick={() => respondRequest(p, true)} className="text-[11px] text-success font-medium hover:underline">Aprovar</button>
                                <button onClick={() => respondRequest(p, false)} className="text-[11px] text-danger hover:underline">Recusar</button>
                              </div>
                            </div>
                          )}
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

                          <div>
                            <label className="block text-[10.5px] text-inkfaint mb-1">Dias de atendimento / horário</label>
                            <div className="flex flex-wrap items-center gap-1">
                              {WEEKDAYS.map((d) => (
                                <button type="button" key={d.key} onClick={() => setEditForm({ ...editForm, weekdays: toggleDay(editForm.weekdays, d.key) })}
                                  className={`text-[10px] px-1.5 py-1 rounded-md border font-medium ${editForm.weekdays.includes(d.key) ? "bg-accent border-accent text-white" : "border-border text-inksoft hover:border-accent"}`}>
                                  {d.label}
                                </button>
                              ))}
                              <input type="time" value={editForm.sessionTime} onChange={(e) => setEditForm({ ...editForm, sessionTime: e.target.value })}
                                className="px-1.5 py-1 text-[11px] rounded-md border border-border bg-surface2 text-ink mono w-[88px]" />
                            </div>
                          </div>

                          <div className="border-t border-border pt-2">
                            <label className="block text-[10.5px] text-inkfaint mb-1">Pacote de sessões contratadas</label>
                            <div className="grid grid-cols-2 gap-1.5">
                              <input type="number" min="1" value={editForm.packageTotalSessions}
                                onChange={(e) => setEditForm({ ...editForm, packageTotalSessions: e.target.value })} placeholder="Qtd. sessões"
                                className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                              <input type="date" value={editForm.packageStartDate}
                                onChange={(e) => setEditForm({ ...editForm, packageStartDate: e.target.value })}
                                className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[10.5px] text-inkfaint">Horário das sessões:</span>
                              <input type="time" value={editForm.sessionTime} onChange={(e) => setEditForm({ ...editForm, sessionTime: e.target.value })}
                                className="px-1.5 py-1 text-[11px] rounded-md border border-border bg-surface2 text-ink mono w-[88px]" />
                              <span className="text-[10px] text-inkfaint">(mesmo horário usado nos dias de atendimento acima)</span>
                            </div>
                            <div className="text-[10px] text-inkfaint mt-1">
                              {editForm.weekdays.length > 0
                                ? `${editForm.weekdays.length}x por semana (baseado nos dias marcados acima) — as datas são calculadas automaticamente a partir da data de início. Lembre de clicar em Salvar pra confirmar.`
                                : "Marque pelo menos um dia de atendimento acima pra calcular as datas."}
                            </div>
                            {(() => {
                              // Computed live from the edit form (not from the server's p.sessionSchedule)
                              // so the preview reacts instantly to horário/dias/data/quantidade changes,
                              // even before Salvar is clicked.
                              const liveSchedule = computeScheduleClientSide(editForm);
                              return liveSchedule && (
                                <div className="mt-2 bg-surface2 border border-border rounded-md px-2 py-1.5 space-y-1">
                                  <div className="flex items-center justify-between text-[10.5px]">
                                    <span className="text-inksoft font-medium">{liveSchedule.completed}/{liveSchedule.total} sessões realizadas</span>
                                  </div>
                                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                                    {liveSchedule.dates.map((d, i) => (
                                      <div key={d} className={`flex items-center justify-between text-[10px] ${new Date(d) < new Date() ? "text-inkfaint line-through" : "text-ink"}`}>
                                        <span>Sessão {i + 1}</span>
                                        <span className="mono">{fmtScheduleWeekday(d)}, {fmtScheduleDateTime(d)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="border-t border-border pt-2">
                            <label className="block text-[10.5px] text-inkfaint mb-1">Sessão por vídeo (Google Meet)</label>
                            {p.meetLink && !editingMeetLink ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <a href={p.meetLink} target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] bg-accent text-white font-medium px-2.5 py-1 rounded-md hover:bg-accentink">
                                  Iniciar sessão
                                </a>
                                <button type="button" onClick={() => setEditingMeetLink(true)} className="text-[10.5px] text-inksoft hover:text-accent">
                                  Trocar link
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex gap-1.5">
                                  <input value={editForm.meetLink} onChange={(e) => setEditForm({ ...editForm, meetLink: e.target.value })} placeholder="Cole aqui o link gerado no Meet"
                                    className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink" />
                                  <button type="button" onClick={generateMeetLink} className="text-[10.5px] shrink-0 border border-border rounded-md px-2 py-1 text-inksoft hover:border-accent hover:text-accent">
                                    Gerar no Meet
                                  </button>
                                </div>
                                <div className="text-[10px] text-inkfaint">Clique em "Gerar no Meet" pra abrir uma sala nova, copie o link e cole aqui — depois é só salvar.</div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => saveEdit(p)} className="text-[11px] bg-accent text-white font-medium px-2.5 py-1 rounded-md hover:bg-accentink">
                              Salvar
                            </button>
                            <div className="flex items-center gap-3">
                              <button onClick={() => printReport(p)} className="text-[11px] text-inksoft hover:text-accent">Imprimir relatório</button>
                              <button onClick={() => removePatient(p)} className="text-[11px] text-danger hover:underline">Remover paciente</button>
                            </div>
                          </div>

                          <div className="border-t border-border pt-2 space-y-1.5">
                            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-inkfaint">Relatórios / sessões</div>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                              {(notesById[p.id] || []).map((n) => (
                                <div key={n.id} className="text-[11px] bg-surface2 border border-border rounded-md px-2 py-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] text-inkfaint mono">{fmtDateTime(n.createdAt)}</div>
                                    <label className="flex items-center gap-1 text-[10px] text-inkfaint cursor-pointer shrink-0">
                                      <input type="checkbox" checked={!!n.visibleToPatient} onChange={() => toggleNoteVisibility(p, n)} className="accent-accent w-3 h-3" />
                                      visível pro paciente
                                    </label>
                                  </div>
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

                          <div className="border-t border-border pt-2 space-y-1.5">
                            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-inkfaint">Atividades</div>
                            <div className="space-y-1 max-h-28 overflow-y-auto">
                              {(activitiesById[p.id] || []).map((a) => (
                                <div key={a.id} className="flex items-center gap-1.5 text-[11px] bg-surface2 border border-border rounded-md px-2 py-1">
                                  <input type="checkbox" checked={a.status === "concluida"} onChange={() => toggleActivity(p, a)} className="accent-accent w-3 h-3 shrink-0" />
                                  <span className={`flex-1 min-w-0 truncate ${a.status === "concluida" ? "line-through text-inkfaint" : "text-ink"}`}>{a.title}</span>
                                  {a.dueDate && <span className="text-[10px] text-inkfaint mono shrink-0">{fmtDate(a.dueDate)}</span>}
                                  <button onClick={() => deleteActivity(p, a.id)} className="text-inkfaint hover:text-danger shrink-0 leading-none">×</button>
                                </div>
                              ))}
                              {(activitiesById[p.id] || []).length === 0 && <div className="text-[10.5px] text-inkfaint">Nenhuma atividade ainda.</div>}
                            </div>
                            <div className="flex gap-1.5">
                              <input value={activityDraft.title} onChange={(e) => setActivityDraft({ ...activityDraft, title: e.target.value })} placeholder="Nova atividade…"
                                className="flex-1 px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink" />
                              <input type="date" value={activityDraft.dueDate} onChange={(e) => setActivityDraft({ ...activityDraft, dueDate: e.target.value })}
                                className="w-28 px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                              <button onClick={() => addActivity(p)} disabled={savingActivity}
                                className="text-[11px] bg-accent text-white font-medium px-2.5 rounded-md hover:bg-accentink disabled:opacity-60">
                                {savingActivity ? "…" : "Add"}
                              </button>
                            </div>
                          </div>

                          <div className="border-t border-border pt-2 space-y-1 text-[10.5px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-inkfaint">Acesso ao portal:</span>
                              {p.portalUser ? (
                                <span className={`px-1.5 py-0.5 rounded-full font-medium ${p.portalUser.active ? "bg-successsoft text-success" : "bg-dangersoft text-danger"}`}>
                                  {p.portalUser.active ? "login ativo" : "login desativado"}
                                </span>
                              ) : (
                                <span className="text-inkfaint">sem login ainda</span>
                              )}
                            </div>
                            <div className="text-inkfaint">Crie e gerencie o login na aba <strong className="text-inksoft font-medium">Acessos dos pacientes</strong>.</div>
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
      )}

      {view === "agenda" && (
        <div className="space-y-2">
          <p className="text-[11px] text-inkfaint">Arraste um paciente para o dia da semana em que ele atende. Um paciente pode aparecer em mais de um dia.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
            {WEEKDAYS.map((day) => {
              const items = patients.filter((p) => (p.weekdays || []).includes(day.key));
              return (
                <div
                  key={day.key}
                  onDragOver={(e) => { e.preventDefault(); setDragOverDay(day.key); }}
                  onDragLeave={() => setDragOverDay((d) => (d === day.key ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverDay(null);
                    let data = {};
                    try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { /* ignore */ }
                    if (data.id) moveDay(data.id, data.fromDay ?? null, day.key);
                  }}
                  className={`min-h-[120px] rounded-xl border p-2 transition ${
                    dragOverDay === day.key ? "border-accent bg-accentsoft/40" : "border-border bg-surface2/40"
                  }`}
                >
                  <div className="flex items-center justify-between px-0.5 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint">{day.label}</span>
                    <span className="text-[10px] text-inkfaint mono">{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: p.id, fromDay: day.key }))}
                        className={`bg-surface border border-border rounded-lg p-2 shadow-sm cursor-grab active:cursor-grabbing hover:border-accent/50 transition ${movingId === p.id ? "opacity-50" : ""}`}
                      >
                        <div className="text-xs font-medium text-ink truncate">{p.name}</div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <span className="text-[10px] mono text-inkfaint">{p.sessionTime || "sem horário"}</span>
                          <button
                            onClick={() => removeDay(p.id, day.key)}
                            title="Remover deste dia"
                            className="text-[10px] text-inkfaint hover:text-danger leading-none"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-[10px] text-inkfaint text-center py-2">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {patients.filter((p) => (p.weekdays || []).length === 0).length > 0 && (
            <div className="text-[11px] text-inkfaint">
              Sem dia definido: {patients.filter((p) => (p.weekdays || []).length === 0).map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
