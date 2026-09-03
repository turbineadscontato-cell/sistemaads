"use client";

import { api } from "../lib/api";

// Lista corrida de todas as reuniões agendadas — separada do Calendário
// (que exige navegar dia a dia). Pedido explícito: "abra uma aba de
// reuniões agendadas para ela nao se perde e ir seguindo" — a atendente
// bate o olho e vê tudo que vem por aí, sem clicar em cada dia do mês.
const STATUS_META = {
  agendada: { label: "Agendada", cls: "bg-warningsoft text-warning" },
  solicitada: { label: "Solicitada pelo cliente", cls: "bg-accentsoft text-accent" },
  confirmada: { label: "Confirmada", cls: "bg-successsoft text-success" },
  realizada: { label: "Realizada", cls: "bg-surface2 text-inkfaint" },
  recusada: { label: "Recusada", cls: "bg-dangersoft text-danger" },
};

function fmtDay(d) {
  const dt = new Date(d);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(dt, today)) return "Hoje";
  if (sameDay(dt, tomorrow)) return "Amanhã";
  const label = dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function MeetingsList({ meetings, onChange }) {
  async function setStatus(m, status) {
    await api(`/api/meetings/${m.id}`, { method: "PATCH", body: { status } });
    onChange();
  }

  const pending = meetings.filter((m) => m.status === "solicitada");
  const upcoming = meetings
    .filter((m) => (m.status === "agendada" || m.status === "confirmada" || m.status === "solicitada"))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = meetings
    .filter((m) => m.status === "realizada" || m.status === "recusada")
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
    .slice(0, 20);

  const groups = [];
  let lastKey = null;
  for (const m of upcoming) {
    const key = fmtDay(m.scheduledAt);
    if (key !== lastKey) {
      groups.push({ key, items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(m);
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="bg-accentsoft border border-accent/30 rounded-xl px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">
            {pending.length} reunião(ões) solicitada(s) por clientes — aguardando confirmação
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4.5 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-ink">Próximas reuniões</h3>
        </div>
        {groups.length === 0 ? (
          <div className="px-4.5 py-8 text-center text-inkfaint text-sm">Nenhuma reunião agendada no momento.</div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((g) => (
              <div key={g.key} className="px-4.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint mb-2">{g.key}</div>
                <div className="space-y-2">
                  {g.items.map((m) => {
                    const meta = STATUS_META[m.status] || STATUS_META.agendada;
                    return (
                      <div key={m.id} className="flex items-start justify-between gap-3 bg-surface2/50 border border-border rounded-xl px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-ink mono">{fmtTime(m.scheduledAt)}</span>
                            <span className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${meta.cls}`}>{meta.label}</span>
                          </div>
                          <div className="text-[12.5px] text-inksoft truncate mt-0.5">
                            {m.client ? m.client.name : m.lead ? m.lead.name : "Sem vínculo"}
                          </div>
                          {m.notes && <div className="text-[11px] text-inkfaint mt-0.5">{m.notes}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {m.status === "solicitada" && (
                            <div className="flex gap-2.5">
                              <button onClick={() => setStatus(m, "confirmada")} className="text-[11px] text-success hover:underline font-medium">confirmar</button>
                              <button onClick={() => setStatus(m, "recusada")} className="text-[11px] text-danger hover:underline">recusar</button>
                            </div>
                          )}
                          {(m.status === "agendada" || m.status === "confirmada") && (
                            <button onClick={() => setStatus(m, "realizada")} className="text-[11px] text-accent hover:underline">marcar realizada</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4.5 py-3 border-b border-border">
            <h3 className="font-display font-semibold text-sm text-ink">Histórico recente</h3>
          </div>
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {past.map((m) => {
              const meta = STATUS_META[m.status] || STATUS_META.realizada;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-inksoft truncate">
                      {m.client ? m.client.name : m.lead ? m.lead.name : "Sem vínculo"}
                    </div>
                    <div className="text-[10.5px] text-inkfaint mono">
                      {new Date(m.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {fmtTime(m.scheduledAt)}
                    </div>
                  </div>
                  <span className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${meta.cls}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
