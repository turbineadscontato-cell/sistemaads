"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getUser, clearSession } from "../../lib/api";
import PortalShell from "../../components/PortalShell";

const WEEKDAYS = [
  { key: 0, label: "Domingo" },
  { key: 1, label: "Segunda" },
  { key: 2, label: "Terça" },
  { key: 3, label: "Quarta" },
  { key: 4, label: "Quinta" },
  { key: 5, label: "Sexta" },
  { key: 6, label: "Sábado" },
];

const MOODS = [
  { key: "otimo", label: "Ótimo", emoji: "😄" },
  { key: "bem", label: "Bem", emoji: "🙂" },
  { key: "neutro", label: "Neutro", emoji: "😐" },
  { key: "dificil", label: "Difícil", emoji: "😔" },
  { key: "muito_dificil", label: "Muito difícil", emoji: "😢" },
];

const TABS = [
  { key: "inicio", label: "Início" },
  { key: "sessao", label: "Sessão" },
  { key: "agenda", label: "Agenda" },
  { key: "atividades", label: "Atividades" },
  { key: "relatorios", label: "Relatórios" },
  { key: "diario", label: "Diário" },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function toDateTimeLocal(d) {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
function fmtWeekday(d) {
  if (!d) return "";
  const label = new Date(d).toLocaleDateString("pt-BR", { weekday: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}
// UTC-forced variants for the computed session-package dates (see
// backend/src/utils/sessionSchedule.js) — those are stored as UTC-midnight
// "calendar dates", so formatting them without forcing UTC here would let
// the viewer's own browser timezone shift the displayed weekday/date away
// from what the professional actually configured.
function fmtScheduleWeekday(d) {
  if (!d) return "";
  const label = new Date(d).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}
function fmtScheduleDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export default function PatientPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("inicio");

  const [notes, setNotes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [journal, setJournal] = useState([]);

  const [requestForm, setRequestForm] = useState({ dateTime: "", note: "" });
  const [requesting, setRequesting] = useState(false);
  const [journalDraft, setJournalDraft] = useState({ mood: "", note: "" });
  const [savingJournal, setSavingJournal] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace("/"); return; }
    if (u.role !== "PACIENTE") { router.replace("/dashboard"); return; }
    setUser(u);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const p = await api("/api/patient-portal/me");
      setPatient(p);
    } catch (err) {
      setError(err.message || "Não foi possível carregar seus dados.");
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    if (tab === "relatorios") api("/api/patient-portal/notes").then(setNotes).catch(() => {});
    if (tab === "atividades") api("/api/patient-portal/activities").then(setActivities).catch(() => {});
    if (tab === "diario") api("/api/patient-portal/journal").then(setJournal).catch(() => {});
  }, [tab, user]);

  function logout() {
    clearSession();
    router.push("/");
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!requestForm.dateTime) return;
    setRequesting(true);
    try {
      await api("/api/patient-portal/request-session", {
        method: "POST",
        body: { requestedSessionAt: requestForm.dateTime, requestNote: requestForm.note || undefined },
      });
      setRequestForm({ dateTime: "", note: "" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setRequesting(false);
    }
  }

  async function cancelRequest() {
    try {
      await api("/api/patient-portal/request-session", { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleActivity(a) {
    try {
      await api(`/api/patient-portal/activities/${a.id}`, {
        method: "PATCH",
        body: { status: a.status === "concluida" ? "pendente" : "concluida" },
      });
      const updated = await api("/api/patient-portal/activities");
      setActivities(updated);
    } catch (err) {
      alert(err.message);
    }
  }

  async function submitJournal(e) {
    e.preventDefault();
    if (!journalDraft.mood && !journalDraft.note.trim()) return;
    setSavingJournal(true);
    try {
      await api("/api/patient-portal/journal", { method: "POST", body: { mood: journalDraft.mood || undefined, note: journalDraft.note || undefined } });
      setJournalDraft({ mood: "", note: "" });
      const updated = await api("/api/patient-portal/journal");
      setJournal(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingJournal(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="text-center">
          <p className="text-danger text-sm mb-3">{error}</p>
          <button onClick={logout} className="text-accent text-sm hover:underline">Sair</button>
        </div>
      </div>
    );
  }
  if (!patient || !user) return null;

  const brandLabel = patient.client?.brandName || patient.client?.name || "Portal do paciente";
  const logo = patient.client?.logoBase64;
  const attendanceDays = (patient.weekdays || []).map((d) => WEEKDAYS.find((w) => w.key === d)?.label).filter(Boolean);

  return (
    <PortalShell
      brand={
        <div className="flex items-center gap-2.5 min-w-0">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={brandLabel} className="h-8 w-8 rounded-lg object-contain bg-white/5 shrink-0" />
          ) : null}
          <span className="font-display font-semibold text-white text-[13.5px] truncate">{brandLabel}</span>
        </div>
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      userName={user.name}
      onLogout={logout}
    >
        {tab === "inicio" && (
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkfaint">Olá,</div>
              <h1 className="font-display font-bold text-2xl text-ink">{patient.name}</h1>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Próxima sessão</div>
                <div className="font-display font-semibold text-base mt-1 text-ink">{patient.nextSessionAt ? fmtDateTime(patient.nextSessionAt) : "A combinar"}</div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Dias de atendimento</div>
                <div className="font-display font-semibold text-base mt-1 text-ink">{attendanceDays.length ? attendanceDays.join(", ") : "—"}{patient.sessionTime ? ` · ${patient.sessionTime}` : ""}</div>
              </div>
            </div>
            <button onClick={() => setTab("sessao")}
              className="block w-full sm:w-fit text-center bg-accent text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-accentink transition">
              Iniciar sessão por vídeo
            </button>
            {patient.requestedSessionAt && (
              <div className="bg-warningsoft border border-warning/30 rounded-lg px-3.5 py-2.5 text-sm text-ink">
                Você pediu para mudar sua sessão para <span className="mono">{fmtDateTime(patient.requestedSessionAt)}</span> — aguardando confirmação.
              </div>
            )}
            {patient.sessionSchedule && (
              <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] uppercase tracking-wide text-inkfaint">Seu pacote de sessões</div>
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-surface2 text-inksoft border border-border">
                    {patient.sessionSchedule.completed}/{patient.sessionSchedule.total} realizadas
                  </span>
                </div>
                <div className="space-y-1">
                  {patient.sessionSchedule.dates.map((d, i) => {
                    const past = new Date(d) < new Date();
                    return (
                      <div key={d} className={`flex items-center justify-between text-sm gap-2 ${past ? "text-inkfaint line-through" : "text-ink"}`}>
                        <span>Sessão {i + 1}</span>
                        <span className="mono text-[13px]">{fmtScheduleWeekday(d)}, {fmtScheduleDateTime(d)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "sessao" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display font-semibold text-base text-ink">Sessão por vídeo</h2>
              <p className="text-[11px] text-inkfaint mt-0.5">Sua sessão acontece pelo Google Meet — clique abaixo pra entrar.</p>
            </div>
            {patient.meetLink ? (
              <div className="bg-surface border border-border rounded-xl shadow-sm p-6 text-center space-y-3">
                <div className="text-sm text-inksoft">Tudo pronto — sua sala de sessão está aberta.</div>
                <a href={patient.meetLink} target="_blank" rel="noopener noreferrer"
                  className="inline-block bg-accent text-white text-sm font-medium px-6 py-3 rounded-lg hover:bg-accentink transition">
                  Entrar na sessão agora
                </a>
                <div className="text-[10.5px] text-inkfaint">Abre o Google Meet numa aba nova.</div>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl shadow-sm p-6 text-center space-y-2">
                <div className="text-sm text-inksoft">Ainda não tem um link de sessão configurado.</div>
                <div className="text-[11px] text-inkfaint">Assim que quem te atende iniciar a sessão, o link aparece aqui automaticamente.</div>
                <button onClick={load} className="text-xs text-accent hover:underline mt-1">Atualizar</button>
              </div>
            )}
          </div>
        )}

        {tab === "agenda" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display font-semibold text-base text-ink">Agenda</h2>
              <p className="text-[11px] text-inkfaint mt-0.5">Seus dias fixos de atendimento e um jeito de pedir para mudar sua próxima sessão.</p>
            </div>
            <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
              <div className="text-[11px] uppercase tracking-wide text-inkfaint mb-1">Dias fixos</div>
              <div className="text-sm text-ink">{attendanceDays.length ? attendanceDays.join(", ") : "Nenhum dia fixo definido ainda."}{patient.sessionTime ? ` às ${patient.sessionTime}` : ""}</div>
            </div>

            {patient.requestedSessionAt ? (
              <div className="bg-surface border border-warning/30 rounded-xl shadow-sm p-4 space-y-2">
                <div className="text-sm text-ink">Pedido enviado: <span className="mono">{fmtDateTime(patient.requestedSessionAt)}</span></div>
                {patient.requestNote && <div className="text-xs text-inksoft">"{patient.requestNote}"</div>}
                <button onClick={cancelRequest} className="text-xs text-danger hover:underline">Cancelar pedido</button>
              </div>
            ) : (
              <form onSubmit={submitRequest} className="bg-surface border border-border rounded-xl shadow-sm p-4 space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint">Solicitar mudança de horário</div>
                <input type="datetime-local" required value={requestForm.dateTime} onChange={(e) => setRequestForm({ ...requestForm, dateTime: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                <input value={requestForm.note} onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })} placeholder="Algum detalhe? (opcional)"
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                <button disabled={requesting} className="bg-accent text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60">
                  {requesting ? "Enviando…" : "Enviar pedido"}
                </button>
              </form>
            )}
          </div>
        )}

        {tab === "atividades" && (
          <div className="space-y-3">
            <div>
              <h2 className="font-display font-semibold text-base text-ink">Atividades</h2>
              <p className="text-[11px] text-inkfaint mt-0.5">O que ficou combinado entre as sessões.</p>
            </div>
            <div className="bg-surface border border-border rounded-xl shadow-sm divide-y divide-border">
              {activities.map((a) => (
                <label key={a.id} className="flex items-center gap-2.5 px-4 py-3 cursor-pointer">
                  <input type="checkbox" checked={a.status === "concluida"} onChange={() => toggleActivity(a)} className="accent-accent w-4 h-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${a.status === "concluida" ? "line-through text-inkfaint" : "text-ink"}`}>{a.title}</div>
                    {a.description && <div className="text-[11px] text-inkfaint mt-0.5">{a.description}</div>}
                  </div>
                  {a.dueDate && <span className="text-[10.5px] text-inkfaint mono shrink-0">{fmtDate(a.dueDate)}</span>}
                </label>
              ))}
              {activities.length === 0 && <div className="px-4 py-8 text-center text-inkfaint text-sm">Nenhuma atividade por enquanto.</div>}
            </div>
          </div>
        )}

        {tab === "relatorios" && (
          <div className="space-y-3">
            <div>
              <h2 className="font-display font-semibold text-base text-ink">Relatórios</h2>
              <p className="text-[11px] text-inkfaint mt-0.5">Anotações que foram compartilhadas com você sobre suas sessões.</p>
            </div>
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="bg-surface border border-border rounded-xl shadow-sm p-4">
                  <div className="text-[10.5px] text-inkfaint mono">{fmtDateTime(n.createdAt)}</div>
                  <div className="text-sm text-ink whitespace-pre-wrap mt-1">{n.content}</div>
                </div>
              ))}
              {notes.length === 0 && <div className="text-center text-inkfaint text-sm py-8">Nenhum relatório compartilhado ainda.</div>}
            </div>
          </div>
        )}

        {tab === "diario" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display font-semibold text-base text-ink">Como foi seu dia?</h2>
              <p className="text-[11px] text-inkfaint mt-0.5">Um espaço seu para registrar como você está — visível também pra quem te atende.</p>
            </div>
            <form onSubmit={submitJournal} className="bg-surface border border-border rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button type="button" key={m.key} onClick={() => setJournalDraft({ ...journalDraft, mood: m.key })}
                    className={`text-sm px-3 py-1.5 rounded-md border font-medium ${journalDraft.mood === m.key ? "bg-accent border-accent text-white" : "border-border text-inksoft hover:border-accent"}`}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
              <textarea value={journalDraft.note} onChange={(e) => setJournalDraft({ ...journalDraft, note: e.target.value })} rows={3} placeholder="Quer escrever mais alguma coisa? (opcional)"
                className="w-full px-2.5 py-2 text-sm rounded-md border border-border bg-surface2 text-ink resize-none" />
              <button disabled={savingJournal} className="bg-accent text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60">
                {savingJournal ? "Salvando…" : "Registrar"}
              </button>
            </form>
            <div className="space-y-2">
              {journal.map((j) => {
                const mood = MOODS.find((m) => m.key === j.mood);
                return (
                  <div key={j.id} className="bg-surface border border-border rounded-xl shadow-sm p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink">{mood ? `${mood.emoji} ${mood.label}` : "—"}</span>
                      <span className="text-[10.5px] text-inkfaint mono">{fmtDateTime(j.createdAt)}</span>
                    </div>
                    {j.note && <div className="text-sm text-inksoft whitespace-pre-wrap mt-1.5">{j.note}</div>}
                  </div>
                );
              })}
              {journal.length === 0 && <div className="text-center text-inkfaint text-sm py-8">Nenhum registro ainda.</div>}
            </div>
          </div>
        )}
    </PortalShell>
  );
}
