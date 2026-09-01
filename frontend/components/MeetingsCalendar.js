"use client";

import { useMemo, useState } from "react";
import { api } from "../lib/api";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const STATUS_META = {
  agendada: { label: "Agendada", cls: "bg-warningsoft text-warning" },
  solicitada: { label: "Solicitada pelo cliente", cls: "bg-accentsoft text-accent" },
  confirmada: { label: "Confirmada", cls: "bg-successsoft text-success" },
  realizada: { label: "Realizada", cls: "bg-surface2 text-inkfaint" },
  recusada: { label: "Recusada", cls: "bg-dangersoft text-danger" },
};

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function MeetingsCalendar({ meetings, leads, onChange }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [form, setForm] = useState({ leadId: "", date: "", time: "", notes: "" });

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor]);

  const meetingsByDay = useMemo(() => {
    const map = {};
    for (const m of meetings) {
      const d = new Date(m.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] ||= []).push(m);
    }
    return map;
  }, [meetings]);

  function dayKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  const today = new Date();
  const selectedMeetings = (meetingsByDay[dayKey(selectedDay)] || []).sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );
  const pendingRequests = meetings.filter((m) => m.status === "solicitada");

  async function createMeeting(e) {
    e.preventDefault();
    if (!form.date || !form.time) return;
    try {
      await api("/api/meetings", {
        method: "POST",
        body: {
          leadId: form.leadId || null,
          scheduledAt: `${form.date}T${form.time}:00`,
          notes: form.notes,
        },
      });
      setForm({ leadId: "", date: "", time: "", notes: "" });
      onChange();
    } catch (err) {
      alert(err.message);
    }
  }

  async function setStatus(m, status) {
    await api(`/api/meetings/${m.id}`, { method: "PATCH", body: { status } });
    onChange();
  }

  return (
    <div className="space-y-4">
      {pendingRequests.length > 0 && (
        <div className="bg-accentsoft border border-accent/30 rounded-xl px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent mb-1.5">
            {pendingRequests.length} reunião(ões) solicitada(s) por clientes — aguardando confirmação
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="w-8 h-8 rounded-full border border-border text-inksoft hover:border-accent hover:text-accent transition flex items-center justify-center">‹</button>
            <div className="font-display font-bold text-base text-ink capitalize">
              {MONTHS[cursor.getMonth()]} <span className="text-inkfaint font-medium">{cursor.getFullYear()}</span>
            </div>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="w-8 h-8 rounded-full border border-border text-inksoft hover:border-accent hover:text-accent transition flex items-center justify-center">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wide text-inkfaint py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const dayMeetings = meetingsByDay[dayKey(d)] || [];
              const hasPending = dayMeetings.some((m) => m.status === "solicitada");
              const isToday = sameDay(d, today);
              const isSelected = sameDay(d, selectedDay);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(d)}
                  className={`aspect-square rounded-xl text-sm flex flex-col items-center justify-center gap-1 border transition relative ${
                    isSelected
                      ? "border-accent bg-accent text-white shadow-sm"
                      : isToday
                      ? "border-accent/50 bg-accentsoft text-accent"
                      : "border-transparent bg-surface2/40 hover:bg-surface2 text-inksoft"
                  }`}
                >
                  <span className="mono font-semibold">{d.getDate()}</span>
                  {dayMeetings.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {dayMeetings.slice(0, 3).map((m, mi) => (
                        <span key={mi} className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : m.status === "solicitada" ? "bg-accent" : "bg-inkfaint"}`} />
                      ))}
                    </span>
                  )}
                  {hasPending && !isSelected && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={createMeeting} className="bg-surface border border-border rounded-xl p-3.5 shadow-sm space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint">Nova reunião</div>
            <select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
              <option value="">Sem lead vinculado</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-1/2 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
              <input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-1/2 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
            </div>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações"
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
            <button className="w-full bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink transition">Agendar</button>
          </form>

          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-inkfaint capitalize">
              {selectedDay.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
            </div>
            <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
              {selectedMeetings.map((m) => {
                const meta = STATUS_META[m.status] || STATUS_META.agendada;
                return (
                  <div key={m.id} className="px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-ink mono">{fmtTime(m.scheduledAt)}</div>
                        <div className="text-xs text-inksoft truncate">
                          {m.client ? m.client.name : m.lead ? m.lead.name : "Sem vínculo"}
                        </div>
                        {m.notes && <div className="text-[10.5px] text-inkfaint mt-0.5">{m.notes}</div>}
                      </div>
                      <span className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <div className="flex gap-2.5 mt-1.5">
                      {m.status === "solicitada" && (
                        <>
                          <button onClick={() => setStatus(m, "confirmada")} className="text-[10.5px] text-success hover:underline">confirmar</button>
                          <button onClick={() => setStatus(m, "recusada")} className="text-[10.5px] text-danger hover:underline">recusar</button>
                        </>
                      )}
                      {(m.status === "agendada" || m.status === "confirmada") && (
                        <button onClick={() => setStatus(m, "realizada")} className="text-[10.5px] text-accent hover:underline">marcar como realizada</button>
                      )}
                      {m.status === "realizada" && (
                        <button onClick={() => setStatus(m, "agendada")} className="text-[10.5px] text-inkfaint hover:underline">reabrir</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {selectedMeetings.length === 0 && (
                <div className="px-3.5 py-6 text-center text-inkfaint text-xs">Nenhuma reunião nesse dia.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
