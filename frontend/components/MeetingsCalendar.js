"use client";

import { useMemo, useState } from "react";
import { api } from "../lib/api";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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

  async function toggleDone(m) {
    const next = m.status === "realizada" ? "agendada" : "realizada";
    await api(`/api/meetings/${m.id}`, { method: "PATCH", body: { status: next } });
    onChange();
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4">
      <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="w-7 h-7 rounded-md border border-border text-inksoft hover:border-accent hover:text-accent transition">‹</button>
          <div className="font-display font-semibold text-sm text-ink">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </div>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="w-7 h-7 rounded-md border border-border text-inksoft hover:border-accent hover:text-accent transition">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-center text-[10px] uppercase text-inkfaint py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d, i) => {
            if (!d) return <div key={i} />;
            const dayMeetings = meetingsByDay[dayKey(d)] || [];
            const isToday = sameDay(d, today);
            const isSelected = sameDay(d, selectedDay);
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(d)}
                className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 border transition ${
                  isSelected ? "border-accent bg-accentsoft text-accent" : "border-transparent hover:border-border text-inksoft"
                } ${isToday && !isSelected ? "ring-1 ring-accent/40" : ""}`}
              >
                <span className="mono">{d.getDate()}</span>
                {dayMeetings.length > 0 && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-accent" : "bg-accent/70"}`} />
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
          <div className="px-3.5 py-2.5 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-inkfaint">
            {selectedDay.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
          </div>
          <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
            {selectedMeetings.map((m) => (
              <label key={m.id} className="flex items-start gap-2.5 px-3.5 py-2.5 cursor-pointer">
                <input type="checkbox" checked={m.status === "realizada"} onChange={() => toggleDone(m)}
                  className="accent-accent w-3.5 h-3.5 mt-0.5" />
                <div className="min-w-0">
                  <div className={`text-xs font-medium ${m.status === "realizada" ? "line-through text-inkfaint" : "text-ink"}`}>
                    {fmtTime(m.scheduledAt)} {m.lead ? `· ${m.lead.name}` : ""}
                  </div>
                  {m.notes && <div className="text-[10.5px] text-inkfaint">{m.notes}</div>}
                </div>
              </label>
            ))}
            {selectedMeetings.length === 0 && (
              <div className="px-3.5 py-6 text-center text-inkfaint text-xs">Nenhuma reunião nesse dia.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
