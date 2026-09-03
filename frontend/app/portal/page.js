"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getUser, clearSession, updateStoredUser } from "../../lib/api";
import { LOGO_SIDEBAR_SRC } from "../../lib/logo";
import PortalShell from "../../components/PortalShell";
import ClientFiles from "../../components/ClientFiles";
import ClientReports from "../../components/ClientReports";
import ClientLeadsBoard from "../../components/ClientLeadsBoard";
import PatientsBoard from "../../components/PatientsBoard";
import PatientLogins from "../../components/PatientLogins";
import ContentCalendar from "../../components/ContentCalendar";
import ClientMarketingAI from "../../components/ClientMarketingAI";
import BrandingSettings from "../../components/BrandingSettings";
import { weekdayPhrase } from "../../lib/weekday";

const STATUS_LABEL = { ATIVO: "Ativo", PENDENTE_PAGAMENTO: "Pendente de pagamento", ONBOARDING: "Em onboarding", CANCELADO: "Cancelado" };
const PAYMENT_LABEL = { PAGO: "Pago", PENDENTE: "Pendente", ATRASADO: "Atrasado" };
const MEETING_STATUS_LABEL = { agendada: "Agendada", solicitada: "Aguardando confirmação", confirmada: "Confirmada", realizada: "Realizada", recusada: "Não foi possível" };

// traffic: true marks tabs that only make sense while paid traffic is part
// of the plan — hidden once the client is on planType "SO_SISTEMA" (kept the
// system, cancelled the ads). Everything else (IA, Pacientes, conteúdo,
// leads, arquivos) is plan-agnostic and always shows.
const TABS = [
  { key: "geral", label: "Visão geral" },
  { key: "ia", label: "IA de Marketing" },
  { key: "pacientes", label: "Pacientes" },
  { key: "acessos", label: "Acessos dos pacientes" },
  { key: "conteudo", label: "Calendário de conteúdo" },
  { key: "leads", label: "Meus leads" },
  { key: "arquivos", label: "Arquivos" },
  { key: "relatorios", label: "Relatórios", traffic: true },
  { key: "marca", label: "Marca" },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function currency(n) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ClientPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [client, setClient] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState("");
  const [meetingForm, setMeetingForm] = useState({ date: "", time: "", notes: "" });
  const [requesting, setRequesting] = useState(false);
  const [tab, setTab] = useState("geral");

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace("/"); return; }
    if (u.role === "PACIENTE") { router.replace("/paciente-portal"); return; }
    if (u.role !== "CLIENTE") { router.replace("/dashboard"); return; }
    setUser(u);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([
        api("/api/clients/me/portal"),
        api("/api/meetings"),
      ]);
      setClient(c);
      setMeetings(m);
    } catch (err) {
      setError(err.message || "Não foi possível carregar seus dados.");
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function logout() {
    clearSession();
    router.push("/");
  }

  function handleAvatarSaved(avatarUrl) {
    const merged = updateStoredUser({ avatarUrl });
    if (merged) setUser(merged);
  }

  async function requestMeeting(e) {
    e.preventDefault();
    if (!meetingForm.date || !meetingForm.time) return;
    setRequesting(true);
    try {
      await api("/api/meetings", {
        method: "POST",
        body: { scheduledAt: `${meetingForm.date}T${meetingForm.time}:00`, notes: meetingForm.notes },
      });
      setMeetingForm({ date: "", time: "", notes: "" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setRequesting(false);
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
  if (!client || !user) return null;

  const upcomingMeetings = meetings
    .filter((m) => m.status !== "realizada" && m.status !== "recusada")
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const isSoSistema = client.planType === "SO_SISTEMA";
  const visibleTabs = TABS.filter((t) => !t.traffic || !isSoSistema);

  return (
    <PortalShell
      brand={<img src={LOGO_SIDEBAR_SRC} alt="TurbinaADS" className="h-7 w-auto" />}
      tabs={visibleTabs}
      activeTab={tab}
      onTabChange={setTab}
      userName={user.name}
      user={user}
      onAvatarSaved={handleAvatarSaved}
      onLogout={logout}
    >
        {tab === "geral" && (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkfaint">Portal do cliente</div>
              <h1 className="font-display font-bold text-2xl text-ink">{client.name}</h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className={`pill pill-${client.status}`}>{STATUS_LABEL[client.status]}</span>
                {isSoSistema && (
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-surface2 text-inksoft border border-border">Plano: só sistema</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5">
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Plano</div>
                <div className="font-display font-semibold text-base mt-1 text-ink">{client.plan || "—"}</div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Investimento mensal</div>
                <div className="font-display font-semibold text-base mt-1 mono text-accent">{currency(client.monthlyValue)}</div>
              </div>
              {!isSoSistema && (
                <>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-inkfaint">Verba diária de anúncios</div>
                    <div className="font-display font-semibold text-base mt-1 mono text-ink">{currency(client.dailyAdBudget)}</div>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-inkfaint">Criativo em veiculação</div>
                    <div className="font-display font-semibold text-base mt-1 text-ink truncate">{client.activeCreative || "—"}</div>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-inkfaint">Dia de otimização</div>
                    <div className="font-display font-semibold text-base mt-1 text-ink">{weekdayPhrase(client.optimizationDay)}</div>
                  </div>
                  {client.optimizationDay != null && (
                    <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-wide text-inkfaint">Última otimização</div>
                      <div className="font-display font-semibold text-base mt-1 text-success">
                        {client.lastOptimizedAt ? `Feita em ${fmtDate(client.lastOptimizedAt)} ✓` : "Ainda não registrada"}
                      </div>
                      <div className="text-[11px] text-inkfaint mt-1">Próxima: {fmtDate(client.nextOptimizationDate)}</div>
                    </div>
                  )}
                </>
              )}
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Gestor responsável</div>
                <div className="font-display font-semibold text-base mt-1 text-ink truncate">{client.gestor?.name || "—"}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Pagamentos</div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {client.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <div>
                        <div className="mono text-ink">{currency(p.amount)}</div>
                        <div className="text-[10.5px] text-inkfaint">vence {fmtDate(p.dueDate)}</div>
                      </div>
                      <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${p.status === "PAGO" ? "bg-successsoft text-success" : p.status === "ATRASADO" ? "bg-dangersoft text-danger" : "bg-warningsoft text-warning"}`}>
                        {PAYMENT_LABEL[p.status]}
                      </span>
                    </div>
                  ))}
                  {client.payments.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Nenhum pagamento registrado.</div>}
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Reuniões</div>
                <form onSubmit={requestMeeting} className="p-3 border-b border-border space-y-2">
                  <div className="text-[11px] text-inkfaint">Solicitar uma reunião — escolha data e horário:</div>
                  <div className="flex gap-2">
                    <input type="date" required value={meetingForm.date} onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })}
                      className="w-1/2 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                    <input type="time" required value={meetingForm.time} onChange={(e) => setMeetingForm({ ...meetingForm, time: e.target.value })}
                      className="w-1/2 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                  </div>
                  <input value={meetingForm.notes} onChange={(e) => setMeetingForm({ ...meetingForm, notes: e.target.value })} placeholder="Assunto (opcional)"
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                  <button disabled={requesting} className="w-full bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
                    {requesting ? "Enviando…" : "Solicitar reunião"}
                  </button>
                </form>
                <div className="divide-y divide-border max-h-56 overflow-y-auto">
                  {upcomingMeetings.map((m) => (
                    <div key={m.id} className="px-4 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-ink">{fmtDateTime(m.scheduledAt)}</span>
                        <span className="text-[10px] uppercase tracking-wide text-inkfaint">{MEETING_STATUS_LABEL[m.status] || m.status}</span>
                      </div>
                      {m.notes && <div className="text-[10.5px] text-inkfaint mt-0.5">{m.notes}</div>}
                    </div>
                  ))}
                  {upcomingMeetings.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Nenhuma reunião agendada.</div>}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "ia" && <ClientMarketingAI />}
        {tab === "pacientes" && <PatientsBoard />}
        {tab === "acessos" && <PatientLogins />}
        {tab === "conteudo" && <ContentCalendar clientId={client.id} />}
        {tab === "leads" && <ClientLeadsBoard clientId={client.id} canEdit />}
        {tab === "arquivos" && <ClientFiles clientId={client.id} canManage={false} allowClientUpload showScriptGenerator={false} />}
        {tab === "relatorios" && !isSoSistema && <ClientReports clientId={client.id} canManage={false} />}
        {tab === "marca" && <BrandingSettings client={client} onChange={load} />}
    </PortalShell>
  );
}
