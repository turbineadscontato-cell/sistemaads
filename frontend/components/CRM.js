"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import LeadsKanban from "./LeadsKanban";
import MeetingsCalendar from "./MeetingsCalendar";

export default function CRM() {
  const [subtab, setSubtab] = useState("funil");
  const [leads, setLeads] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, m] = await Promise.all([api("/api/leads"), api("/api/meetings")]);
      setLeads(l);
      setMeetings(m);
    } catch (err) {
      // surfaced via alert in child forms; keep silent here
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setSubtab("funil")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${subtab === "funil" ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}
        >
          Funil de vendas
        </button>
        <button
          onClick={() => setSubtab("calendario")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${subtab === "calendario" ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}
        >
          Calendário
        </button>
      </div>

      {subtab === "funil" && <LeadsKanban leads={leads} onChange={load} loading={loading} />}
      {subtab === "calendario" && <MeetingsCalendar meetings={meetings} leads={leads} onChange={load} />}
    </section>
  );
}
