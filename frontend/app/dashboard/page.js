"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getUser, clearSession } from "../../lib/api";
import { LOGO_SIDEBAR_SRC } from "../../lib/logo";
import CRM from "../../components/CRM";
import UsersPanel from "../../components/UsersPanel";
import Reports from "../../components/Reports";
import AIAssistants from "../../components/AIAssistants";
import TaskTitleField from "../../components/TaskTitleField";
import Campaigns from "../../components/Campaigns";
import DashboardShell from "../../components/DashboardShell";
import { NAV_ICON, IconSearch, IconAlert, IconMoney, IconTrophy, IconUsers, IconTasks, IconClock, IconChevronRight, IconX, IconStar } from "../../components/icons";

const STATUS_LABEL = {
  ATIVO: "Ativo",
  PENDENTE_PAGAMENTO: "Pendente",
  ONBOARDING: "Onboarding",
  CANCELADO: "Cancelado",
};
const STATUS_FILTERS = ["TODOS", "ATIVO", "PENDENTE_PAGAMENTO", "ONBOARDING", "CANCELADO"];

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function currency(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === "CONCLUIDA") return false;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// Bolinha de prazo (verde/amarela/vermelha) pedida pelo usuário — separada
// da prioridade da tarefa: verde = tranquilo, dentro do prazo; amarela =
// prazo chegando (3 dias ou menos); vermelha = já passou do prazo. Uma
// tarefa concluída ou sem prazo definido não tem por que preocupar, então
// conta como "tranquila". Vale tanto pro sócio quanto pros gestores.
function taskUrgencyTone(dueDate, status) {
  if (status === "CONCLUIDA" || !dueDate) return "success";
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays < 0) return "danger";
  if (diffDays <= 3) return "warning";
  return "success";
}
const DOT_CLASS = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Compact stat card used across the overview row — an icon badge in the
// agency's accent (or a semantic color for alerts) plus a big mono number,
// the "cara de empresa grande" look the client asked for instead of the
// plain boxed-in stat tiles from before.
function StatCard({ icon: Icon, label, value, tone = "accent", sub }) {
  const toneClass = {
    accent: "bg-accentsoft text-accent",
    danger: "bg-dangersoft text-danger",
    success: "bg-successsoft text-success",
    warning: "bg-warningsoft text-warning",
  }[tone];
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 sm:p-4.5 shadow-sm flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toneClass}`}>
        <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-wide text-inkfaint truncate">{label}</div>
        <div className="font-display font-bold text-2xl mono mt-0.5 text-ink leading-none">{value}</div>
        {sub && <div className="text-[10.5px] text-inkfaint mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("clientes");

  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [gestores, setGestores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newClient, setNewClient] = useState({ name: "", niche: "", plan: "", monthlyValue: "", gestorId: "", optimizationDay: "" });
  const [newTask, setNewTask] = useState({ title: "", clientId: "", gestorId: "", priority: "MEDIA", dueDate: "" });
  const [showNewClient, setShowNewClient] = useState(false);
  // Atalho de "minhas tarefas" dentro da aba Meus clientes — o sócio cria
  // uma tarefa pra si mesmo (gestor já fixo em user.id) sem precisar trocar
  // pra aba Tarefas.
  const [newOwnTask, setNewOwnTask] = useState({ title: "", clientId: "", priority: "MEDIA", dueDate: "" });

  // Busca + filtro + ordenação da carteira de clientes — tudo calculado no
  // navegador a partir dos dados já carregados, sem chamada extra à API.
  const [clientSearch, setClientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  // Painel rápido "quem é esse cliente" — aberto ao clicar no nome do cliente
  // dentro de uma tarefa, pra dar contexto (nicho, verba, conta de anúncio,
  // observações) sem precisar sair da aba Tarefas pra abrir a página completa.
  const [infoClientId, setInfoClientId] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/");
      return;
    }
    if (u.role === "CLIENTE") {
      router.replace("/portal");
      return;
    }
    if (u.role === "PACIENTE") {
      router.replace("/paciente-portal");
      return;
    }
    setUser(u);
    setTab(u.role === "ATENDENTE" ? "atendimento" : "clientes");
  }, [router]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const calls = [];
      if (user.role !== "ATENDENTE") {
        calls.push(api("/api/clients").then(setClients));
        calls.push(api("/api/tasks").then(setTasks));
        calls.push(api("/api/users/gestores").then(setGestores));
      }
      await Promise.all(calls);
    } catch (err) {
      setError(err.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function logout() {
    clearSession();
    router.push("/");
  }

  async function createClient(e) {
    e.preventDefault();
    try {
      await api("/api/clients", {
        method: "POST",
        body: {
          ...newClient,
          monthlyValue: newClient.monthlyValue ? Number(newClient.monthlyValue) : null,
          gestorId: newClient.gestorId || null,
          optimizationDay: newClient.optimizationDay || null,
        },
      });
      setNewClient({ name: "", niche: "", plan: "", monthlyValue: "", gestorId: "", optimizationDay: "" });
      setShowNewClient(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  async function createTask(e) {
    e.preventDefault();
    try {
      await api("/api/tasks", { method: "POST", body: newTask });
      setNewTask({ title: "", clientId: "", gestorId: "", priority: "MEDIA", dueDate: "" });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleTaskStatus(task) {
    const next = task.status === "CONCLUIDA" ? "PENDENTE" : "CONCLUIDA";
    await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { status: next } });
    loadAll();
  }

  async function createOwnTask(e) {
    e.preventDefault();
    try {
      await api("/api/tasks", { method: "POST", body: { ...newOwnTask, gestorId: user.id } });
      setNewOwnTask({ title: "", clientId: "", priority: "MEDIA", dueDate: "" });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  const canSeeCarteira = user ? user.role !== "ATENDENTE" : false;
  const canSeeAtendimento = user ? (user.role === "SOCIO" || user.role === "ATENDENTE") : false;
  const canSeeUsuarios = user ? user.role === "SOCIO" : false;
  const canSeeRelatorios = user ? user.role === "SOCIO" : false;
  const canSeeAssistentes = user ? (user.role === "SOCIO" || user.role === "GESTOR") : false;
  const canSeeCampanhas = user ? (user.role === "SOCIO" || user.role === "GESTOR") : false;
  // O sócio também atua como gestor de tráfego de alguns clientes ("dono
  // particular") — essa aba dá a ele um recorte só com a carteira dele
  // mesmo, pra gerenciar sem misturar com a carteira inteira da agência.
  const canSeeMeusClientes = user ? user.role === "SOCIO" : false;

  const ativos = clients.filter((c) => c.status === "ATIVO").length;
  const pendentesClientes = clients.filter((c) => c.status === "PENDENTE_PAGAMENTO");
  const tarefasAbertas = tasks.filter((t) => t.status !== "CONCLUIDA").length;
  const tarefasAtrasadas = tasks.filter((t) => isOverdue(t.dueDate, t.status));
  const todayOfMonth = new Date().getDate();
  const optimizacoesAtrasadas = clients.filter(
    (c) => c.status === "ATIVO" && c.optimizationDay && todayOfMonth >= c.optimizationDay
  );
  const mrr = clients.filter((c) => c.status === "ATIVO").reduce((sum, c) => sum + (Number(c.monthlyValue) || 0), 0);
  const attentionCount = pendentesClientes.length + tarefasAtrasadas.length + optimizacoesAtrasadas.length;

  // Desempenho por gestor (só o sócio vê) — quantos clientes cada um carrega
  // e o quanto das próprias tarefas já concluiu, pra ter uma visão geral da
  // equipe sem precisar abrir relatório nenhum.
  const leaderboard = useMemo(() => {
    if (!user || user.role !== "SOCIO") return [];
    return gestores.map((g) => {
      const gTasks = tasks.filter((t) => t.gestorId === g.id);
      const gDone = gTasks.filter((t) => t.status === "CONCLUIDA").length;
      const gOpen = gTasks.length - gDone;
      return {
        ...g,
        clientCount: clients.filter((c) => c.gestorId === g.id).length,
        openTasks: gOpen,
        pct: gTasks.length > 0 ? Math.round((gDone / gTasks.length) * 100) : null,
      };
    }).sort((a, b) => b.clientCount - a.clientCount);
  }, [user, gestores, tasks, clients]);

  // "Meus clientes" (só sócio) recorta a carteira pra só os clientes onde
  // ele mesmo é o gestor responsável — o mesmo recorte que um gestor comum
  // já enxerga por padrão em "Clientes", só que aqui é o sócio escolhendo
  // ver a própria parte em vez da carteira inteira da agência.
  const myClients = useMemo(() => (user ? clients.filter((c) => c.gestorId === user.id) : []), [clients, user]);
  const myTasks = useMemo(() => (user ? tasks.filter((t) => t.gestorId === user.id) : []), [tasks, user]);

  const filteredClients = useMemo(() => {
    const base = tab === "meus-clientes" ? myClients : clients;
    const q = clientSearch.trim().toLowerCase();
    const list = base
      .filter((c) => statusFilter === "TODOS" || c.status === statusFilter)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.niche || "").toLowerCase().includes(q) || (c.gestor?.name || "").toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const va = (sortKey === "gestor" ? a.gestor?.name : a[sortKey]) || "";
      const vb = (sortKey === "gestor" ? b.gestor?.name : b[sortKey]) || "";
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  }, [clients, myClients, tab, clientSearch, statusFilter, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (!user) return null;

  const NAV_ITEMS = [
    canSeeCarteira && { key: "clientes", label: "Clientes", icon: NAV_ICON.clientes },
    canSeeMeusClientes && { key: "meus-clientes", label: "Meus clientes", icon: IconStar },
    canSeeCarteira && { key: "tarefas", label: "Tarefas", icon: NAV_ICON.tarefas },
    canSeeAtendimento && { key: "atendimento", label: "CRM de atendimento", icon: NAV_ICON.atendimento },
    canSeeCampanhas && { key: "campanhas", label: "Campanhas", icon: NAV_ICON.campanhas },
    canSeeRelatorios && { key: "relatorios", label: "Relatórios", icon: NAV_ICON.relatorios },
    canSeeAssistentes && { key: "assistentes", label: "Assistentes IA", icon: NAV_ICON.assistentes },
    canSeeUsuarios && { key: "usuarios", label: "Usuários", icon: NAV_ICON.usuarios },
  ].filter(Boolean);

  const todayLabel = capitalize(new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }));

  return (
    <DashboardShell
      brand={<img src={LOGO_SIDEBAR_SRC} alt="TurbinaADS" className="h-8 w-auto" />}
      items={NAV_ITEMS}
      activeTab={tab}
      onTabChange={setTab}
      user={user}
      onLogout={logout}
      topbarRight={<span className="text-[12px] text-inkfaint mono">{todayLabel}</span>}
    >
      {error && (
        <div className="text-sm text-danger bg-dangersoft border border-danger/30 rounded-xl px-3.5 py-2.5">{error}</div>
      )}

      {canSeeCarteira && (tab === "clientes" || tab === "tarefas") && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={IconUsers} label="Clientes ativos" value={loading ? "—" : ativos} tone="accent" />
            <StatCard icon={IconMoney} label={user.role === "SOCIO" ? "Receita mensal (MRR)" : "MRR da sua carteira"} value={loading ? "—" : currency(mrr)} tone="success" />
            <StatCard icon={IconClock} label="Pendentes de pagamento" value={loading ? "—" : pendentesClientes.length} tone={pendentesClientes.length > 0 ? "warning" : "accent"} />
            <StatCard icon={IconTasks} label="Tarefas em aberto" value={loading ? "—" : tarefasAbertas} tone="accent" sub={tarefasAtrasadas.length > 0 ? `${tarefasAtrasadas.length} atrasada(s)` : undefined} />
            <StatCard icon={IconAlert} label="Otimizações vencidas" value={loading ? "—" : optimizacoesAtrasadas.length} tone={optimizacoesAtrasadas.length > 0 ? "danger" : "accent"} />
          </div>

          {!loading && (
            <div className={`grid grid-cols-1 gap-3 ${user.role === "SOCIO" && leaderboard.length > 0 ? "lg:grid-cols-3" : ""}`}>
              {/* Central de atenção — junta tarefa atrasada, pagamento pendente e
                  otimização vencida num só lugar, em vez de três avisos soltos. */}
              <div className={`bg-surface border border-border rounded-2xl overflow-hidden ${user.role === "SOCIO" && leaderboard.length > 0 ? "lg:col-span-2" : ""}`}>
                <div className="px-4.5 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="font-display font-semibold text-sm text-ink">Central de atenção</h3>
                  {attentionCount > 0 && <span className="text-[10.5px] bg-dangersoft text-danger px-2 py-0.5 rounded-full font-semibold">{attentionCount}</span>}
                </div>
                {attentionCount === 0 ? (
                  <div className="px-4.5 py-6 text-center text-[13px] text-inkfaint">Tudo em dia por aqui — nenhuma pendência no momento.</div>
                ) : (
                  <div className="divide-y divide-border max-h-64 overflow-y-auto">
                    {optimizacoesAtrasadas.map((c) => (
                      <Link key={`opt-${c.id}`} href={`/dashboard/clientes/${c.id}`}
                        className="flex items-center gap-3 px-4.5 py-2.5 hover:bg-surface2/60 transition group">
                        <span className="w-7 h-7 rounded-lg bg-dangersoft text-danger flex items-center justify-center shrink-0"><IconAlert className="w-3.5 h-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">{c.name}</div>
                          <div className="text-[11px] text-inkfaint">Dia de otimização vencido (dia {c.optimizationDay})</div>
                        </div>
                        <IconChevronRight className="w-3.5 h-3.5 text-inkfaint shrink-0 group-hover:text-accent transition" />
                      </Link>
                    ))}
                    {pendentesClientes.map((c) => (
                      <Link key={`pag-${c.id}`} href={`/dashboard/clientes/${c.id}`}
                        className="flex items-center gap-3 px-4.5 py-2.5 hover:bg-surface2/60 transition group">
                        <span className="w-7 h-7 rounded-lg bg-warningsoft text-warning flex items-center justify-center shrink-0"><IconClock className="w-3.5 h-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">{c.name}</div>
                          <div className="text-[11px] text-inkfaint">Pagamento pendente</div>
                        </div>
                        <IconChevronRight className="w-3.5 h-3.5 text-inkfaint shrink-0 group-hover:text-accent transition" />
                      </Link>
                    ))}
                    {tarefasAtrasadas.map((t) => (
                      <button key={`tsk-${t.id}`} onClick={() => setInfoClientId(t.clientId || t.client?.id)}
                        className="w-full flex items-center gap-3 px-4.5 py-2.5 hover:bg-surface2/60 transition group text-left">
                        <span className="w-7 h-7 rounded-lg bg-dangersoft text-danger flex items-center justify-center shrink-0"><IconTasks className="w-3.5 h-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">{t.title}</div>
                          <div className="text-[11px] text-inkfaint truncate">Tarefa atrasada · {t.client?.name}</div>
                        </div>
                        <IconChevronRight className="w-3.5 h-3.5 text-inkfaint shrink-0 group-hover:text-accent transition" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {user.role === "SOCIO" && leaderboard.length > 0 && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <div className="px-4.5 py-3 border-b border-border flex items-center gap-2">
                    <IconTrophy className="w-4 h-4 text-accent" />
                    <h3 className="font-display font-semibold text-sm text-ink">Desempenho por gestor</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {leaderboard.map((g) => (
                      <div key={g.id} className="px-4.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-accentsoft text-accent text-[10px] font-bold flex items-center justify-center shrink-0">{initials(g.name)}</span>
                          <span className="text-[13px] text-ink font-medium truncate">{g.name}{g.id === user.id ? " (você)" : ""}</span>
                          <span className="ml-auto text-[11px] text-inkfaint mono shrink-0">{g.clientCount} cliente{g.clientCount === 1 ? "" : "s"}</span>
                        </div>
                        {g.pct != null && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${g.pct}%` }} />
                            </div>
                            <span className="text-[10.5px] text-inkfaint mono shrink-0 w-9 text-right">{g.pct}%</span>
                          </div>
                        )}
                        {g.openTasks > 0 && <div className="text-[10.5px] text-inkfaint mt-1">{g.openTasks} tarefa(s) em aberto</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "meus-clientes" && canSeeMeusClientes && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard icon={IconStar} label="Meus clientes ativos" value={loading ? "—" : myClients.filter((c) => c.status === "ATIVO").length} tone="accent" />
          <StatCard icon={IconMoney} label="MRR da minha carteira" value={loading ? "—" : currency(myClients.filter((c) => c.status === "ATIVO").reduce((s, c) => s + (Number(c.monthlyValue) || 0), 0))} tone="success" />
          <StatCard icon={IconClock} label="Meus pendentes de pagamento" value={loading ? "—" : myClients.filter((c) => c.status === "PENDENTE_PAGAMENTO").length} tone="warning" />
        </div>
      )}

      {tab === "meus-clientes" && canSeeMeusClientes && (
        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-border flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-ink">Minhas tarefas</h3>
            <span className="text-xs text-inkfaint">{myTasks.filter((t) => t.status !== "CONCLUIDA").length} em aberto</span>
          </div>
          <form onSubmit={createOwnTask} className="px-4.5 py-3.5 border-b border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
            <TaskTitleField className="lg:col-span-2" value={newOwnTask.title} onChange={(v) => setNewOwnTask({ ...newOwnTask, title: v })} />
            <div>
              <label className="block text-[11px] text-inkfaint mb-1">Cliente</label>
              <select required value={newOwnTask.clientId} onChange={(e) => setNewOwnTask({ ...newOwnTask, clientId: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink">
                <option value="">Selecione</option>
                {myClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-inkfaint mb-1">Prazo</label>
              <input type="date" value={newOwnTask.dueDate} onChange={(e) => setNewOwnTask({ ...newOwnTask, dueDate: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink mono" />
            </div>
            <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-lg hover:bg-accentink transition">+ Minha tarefa</button>
          </form>
          <div className="divide-y divide-border">
            {myTasks.map((t) => {
              const tone = taskUrgencyTone(t.dueDate, t.status);
              return (
                <label key={t.id} className="flex items-center gap-3 px-4.5 py-3 cursor-pointer hover:bg-surface2/40 transition">
                  <input type="checkbox" checked={t.status === "CONCLUIDA"} onChange={() => toggleTaskStatus(t)} className="accent-accent w-4 h-4 shrink-0" />
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[tone]}`} title={tone === "danger" ? "Atrasada" : tone === "warning" ? "Prazo chegando" : "Tranquila"} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${t.status === "CONCLUIDA" ? "line-through text-inkfaint" : "text-ink"}`}>{t.title}</div>
                    <div className="text-xs text-inkfaint truncate">{t.client?.name}</div>
                  </div>
                  <div className={`text-xs mono shrink-0 ${tone === "danger" ? "text-danger font-semibold" : tone === "warning" ? "text-warning font-medium" : "text-inksoft"}`}>
                    {fmtDate(t.dueDate)}
                  </div>
                </label>
              );
            })}
            {myTasks.length === 0 && <div className="px-4.5 py-8 text-center text-inkfaint text-sm">Nenhuma tarefa sua ainda — adicione uma acima.</div>}
          </div>
        </div>
      )}

      {(tab === "clientes" || tab === "meus-clientes") && canSeeCarteira && (
        <section className="space-y-4">
          {tab === "clientes" && user.role === "SOCIO" && (
            <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => setShowNewClient((v) => !v)}
                className="w-full flex items-center justify-between px-4.5 py-3.5 text-left hover:bg-surface2/40 transition">
                <span className="font-display font-semibold text-sm text-ink">Novo cliente</span>
                <span className="text-xs text-accent font-medium">{showNewClient ? "Fechar" : "+ Adicionar"}</span>
              </button>
              {showNewClient && (
                <form onSubmit={createClient} className="px-4.5 pb-4.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] text-inkfaint mb-1">Nome do cliente</label>
                    <input required value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-inkfaint mb-1">Nicho</label>
                    <input value={newClient.niche} onChange={(e) => setNewClient({ ...newClient, niche: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-inkfaint mb-1">Plano</label>
                    <input value={newClient.plan} onChange={(e) => setNewClient({ ...newClient, plan: e.target.value })}
                      placeholder="R$ 297/mês" className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-inkfaint mb-1">Gestor</label>
                    <select value={newClient.gestorId} onChange={(e) => setNewClient({ ...newClient, gestorId: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink">
                      <option value="">—</option>
                      {gestores.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-inkfaint mb-1">Dia de otimização</label>
                    <input type="number" min="1" max="31" value={newClient.optimizationDay}
                      onChange={(e) => setNewClient({ ...newClient, optimizationDay: e.target.value })}
                      placeholder="ex: 10" className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink mono" />
                  </div>
                  <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-lg hover:bg-accentink transition self-end">Adicionar</button>
                </form>
              )}
            </div>
          )}

          <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4.5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="font-display font-semibold text-sm text-ink">{tab === "meus-clientes" ? "Meus clientes" : "Carteira de clientes"}</h2>
                <span className="text-xs text-inkfaint">{filteredClients.length} de {tab === "meus-clientes" ? myClients.length : clients.length}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <IconSearch className="w-3.5 h-3.5 text-inkfaint absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente, nicho ou gestor…"
                    className="pl-8 pr-2.5 py-1.5 text-[12.5px] rounded-lg border border-border bg-surface2 text-ink w-56 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-[12.5px] rounded-lg border border-border bg-surface2 text-ink">
                  {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "TODOS" ? "Todos os status" : STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-[10.5px] uppercase text-inkfaint text-left select-none">
                    {[["name", "Cliente"], ["status", "Status"], ["plan", "Plano"], ["gestor", "Gestor"]].map(([key, label]) => (
                      <th key={key} className="px-4.5 py-2.5 cursor-pointer hover:text-ink transition" onClick={() => toggleSort(key)}>
                        <span className="inline-flex items-center gap-1">{label}{sortKey === key && <span className="text-accent">{sortDir === "asc" ? "▲" : "▼"}</span>}</span>
                      </th>
                    ))}
                    <th className="px-4.5 py-2.5">Pendências</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-surface2/60 transition">
                      <td className="px-4.5 py-3 min-w-[200px]">
                        <Link href={`/dashboard/clientes/${c.id}`} className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-accentsoft text-accent text-[11px] font-bold flex items-center justify-center shrink-0">{initials(c.name)}</span>
                          <div className="min-w-0">
                            <div className="font-medium text-ink hover:text-accent transition truncate">{c.name}</div>
                            <div className="text-xs text-inkfaint truncate">{c.niche || "—"}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4.5 py-3 whitespace-nowrap"><span className={`pill pill-${c.status}`}>{STATUS_LABEL[c.status]}</span></td>
                      <td className="px-4.5 py-3 mono text-ink whitespace-nowrap">{c.plan || "—"}</td>
                      <td className="px-4.5 py-3 whitespace-nowrap">
                        {c.gestor ? (
                          <span className="inline-flex items-center gap-1.5 text-ink">
                            <span className="w-5 h-5 rounded-full bg-accentsoft text-accent text-[10px] font-bold flex items-center justify-center">{initials(c.gestor.name)}</span>
                            {c.gestor.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4.5 py-3 text-inksoft whitespace-nowrap">{c.openPendencies ? `${c.openPendencies} aberta(s)` : "sem pendências"}</td>
                    </tr>
                  ))}
                  {!loading && filteredClients.length === 0 && (
                    <tr><td colSpan={5} className="px-4.5 py-8 text-center text-inkfaint">
                      {clients.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente encontrado com esse filtro."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === "tarefas" && canSeeCarteira && (
        <section className="space-y-4">
          <form onSubmit={createTask} className="bg-surface border border-border rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <TaskTitleField className="lg:col-span-2" value={newTask.title} onChange={(v) => setNewTask({ ...newTask, title: v })} />
            <div>
              <label className="block text-[11px] text-inkfaint mb-1">Cliente</label>
              <select required value={newTask.clientId} onChange={(e) => setNewTask({ ...newTask, clientId: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink">
                <option value="">Selecione</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {user.role === "SOCIO" && (
              <div>
                <label className="block text-[11px] text-inkfaint mb-1">Gestor</label>
                <select value={newTask.gestorId} onChange={(e) => setNewTask({ ...newTask, gestorId: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink">
                  <option value="">Sem gestor</option>
                  {gestores.map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === user.id ? " (você)" : ""}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[11px] text-inkfaint mb-1">Prioridade</label>
              <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink">
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-inkfaint mb-1">Prazo</label>
              <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-ink mono" />
            </div>
            <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-lg hover:bg-accentink transition">Adicionar</button>
          </form>

          {user.role === "SOCIO" ? (
            // Sócio vê tudo, separado por coluna — uma coluna por gestor (e uma
            // extra pra tarefas ainda sem gestor definido), pra bater o olho e
            // ver rápido quem está com o quê.
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[...gestores, { id: "__sem_gestor__", name: "Sem gestor" }].map((g) => {
                const laneTasks = tasks.filter((t) => (g.id === "__sem_gestor__" ? !t.gestorId : t.gestorId === g.id));
                if (g.id === "__sem_gestor__" && laneTasks.length === 0) return null;
                return (
                  <div key={g.id} className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
                    <div className="px-3.5 py-2.5 border-b border-border font-display font-semibold text-xs text-ink flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {g.id !== "__sem_gestor__" && (
                          <span className="w-5 h-5 rounded-full bg-accentsoft text-accent text-[10px] font-bold flex items-center justify-center shrink-0">{initials(g.name)}</span>
                        )}
                        <span className="truncate">{g.name}{g.id === user.id ? " (você)" : ""}</span>
                      </span>
                      <span className="text-[10.5px] text-inkfaint mono shrink-0">{laneTasks.length}</span>
                    </div>
                    <div className="divide-y divide-border flex-1 min-h-[60px]">
                      {laneTasks.map((t) => {
                        const overdue = isOverdue(t.dueDate, t.status);
                        const tone = taskUrgencyTone(t.dueDate, t.status);
                        return (
                          <label key={t.id} className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] transition">
                            <input type="checkbox" checked={t.status === "CONCLUIDA"} onChange={() => toggleTaskStatus(t)} className="accent-accent w-3.5 h-3.5 shrink-0 mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[tone]}`} title={tone === "danger" ? "Atrasada" : tone === "warning" ? "Prazo chegando" : "Tranquila"} />
                                <span className={`text-[13px] font-medium truncate ${t.status === "CONCLUIDA" ? "line-through text-inkfaint" : "text-ink"}`}>{t.title}</span>
                                {t.priority === "ALTA" && t.status !== "CONCLUIDA" && (
                                  <span className="shrink-0 text-[9px] uppercase font-bold text-danger bg-dangersoft px-1 py-0.5 rounded">alta</span>
                                )}
                              </div>
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoClientId(t.clientId || t.client?.id); }}
                                className="block text-[10.5px] text-inkfaint hover:text-accent hover:underline truncate mt-0.5 text-left">
                                {t.client?.name}
                              </button>
                              <div className={`text-[10.5px] mono mt-0.5 ${overdue ? "text-danger font-semibold" : "text-inksoft"}`}>
                                {overdue ? "atrasada · " : ""}{fmtDate(t.dueDate)}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                      {laneTasks.length === 0 && <div className="px-3 py-6 text-center text-inkfaint text-[11px]">Nenhuma tarefa.</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Gestor: a API já devolve só as tarefas dele, então uma lista simples basta.
            <div className="bg-surface border border-border rounded-2xl shadow-sm divide-y divide-border">
              {tasks.map((t) => {
                const overdue = isOverdue(t.dueDate, t.status);
                const tone = taskUrgencyTone(t.dueDate, t.status);
                return (
                  <label key={t.id} className="flex items-center gap-3 px-4.5 py-3 cursor-pointer">
                    <input type="checkbox" checked={t.status === "CONCLUIDA"} onChange={() => toggleTaskStatus(t)} className="accent-accent w-4 h-4 shrink-0" />
                    <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[tone]}`} title={tone === "danger" ? "Atrasada" : tone === "warning" ? "Prazo chegando" : "Tranquila"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className={`text-sm font-medium truncate ${t.status === "CONCLUIDA" ? "line-through text-inkfaint" : "text-ink"}`}>{t.title}</div>
                        {t.priority === "ALTA" && t.status !== "CONCLUIDA" && (
                          <span className="shrink-0 text-[9px] uppercase font-bold text-danger bg-dangersoft px-1 py-0.5 rounded">alta</span>
                        )}
                      </div>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoClientId(t.clientId || t.client?.id); }}
                        className="block text-xs text-inkfaint hover:text-accent hover:underline truncate text-left">
                        {t.client?.name}
                      </button>
                    </div>
                    <div className={`text-xs mono shrink-0 ${overdue ? "text-danger font-semibold" : "text-inksoft"}`}>
                      {overdue ? "atrasada · " : ""}{fmtDate(t.dueDate)}
                    </div>
                  </label>
                );
              })}
              {!loading && tasks.length === 0 && <div className="px-4.5 py-8 text-center text-inkfaint">Nenhuma tarefa por aqui.</div>}
            </div>
          )}
        </section>
      )}

      {tab === "atendimento" && canSeeAtendimento && <CRM />}
      {tab === "campanhas" && canSeeCampanhas && <Campaigns />}
      {tab === "relatorios" && canSeeRelatorios && <Reports />}
      {tab === "assistentes" && canSeeAssistentes && <AIAssistants />}
      {tab === "usuarios" && canSeeUsuarios && <UsersPanel />}

      {/* Painel rápido "quem é esse cliente" — aberto ao clicar no nome do
          cliente dentro de uma tarefa. Mostra de cara o nicho (ex: "psicóloga"),
          plano, verba/otimização e a conta de anúncio vinculada, sem precisar
          sair da aba Tarefas pra abrir a página completa do cliente. */}
      {infoClientId && (() => {
        const c = clients.find((x) => x.id === infoClientId);
        if (!c) return null;
        return (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <div onClick={() => setInfoClientId(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-inkfaint">{c.niche || "nicho não informado"}</div>
                  <h3 className="font-display font-semibold text-lg text-ink truncate">{c.name}</h3>
                  <span className={`pill pill-${c.status} mt-1.5`}>{STATUS_LABEL[c.status]}</span>
                </div>
                <button onClick={() => setInfoClientId(null)} aria-label="Fechar"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-inksoft hover:text-ink hover:bg-white/5 transition">
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-surface2 border border-border rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-inkfaint">Plano</div>
                    <div className="text-sm text-ink mt-0.5">{c.plan || "—"}</div>
                  </div>
                  <div className="bg-surface2 border border-border rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-inkfaint">Mensalidade</div>
                    <div className="text-sm text-ink mono mt-0.5">{currency(c.monthlyValue)}</div>
                  </div>
                  {c.planType !== "SO_SISTEMA" && (
                    <>
                      <div className="bg-surface2 border border-border rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-inkfaint">Verba diária</div>
                        <div className="text-sm text-ink mono mt-0.5">{currency(c.dailyAdBudget)}</div>
                      </div>
                      <div className="bg-surface2 border border-border rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-inkfaint">Dia de otimização</div>
                        <div className="text-sm text-ink mono mt-0.5">{c.optimizationDay || "—"}</div>
                      </div>
                      <div className="bg-surface2 border border-border rounded-lg px-3 py-2 col-span-2">
                        <div className="text-[10px] uppercase tracking-wide text-inkfaint">Criativo em veiculação</div>
                        <div className="text-sm text-ink mt-0.5 truncate">{c.activeCreative || "—"}</div>
                      </div>
                      <div className="bg-surface2 border border-border rounded-lg px-3 py-2 col-span-2">
                        <div className="text-[10px] uppercase tracking-wide text-inkfaint">Conta de anúncio</div>
                        <div className="text-sm text-ink mt-0.5">
                          {c.adAccounts && c.adAccounts.length > 0
                            ? c.adAccounts.map((a) => a.name).join(", ")
                            : "nenhuma conta vinculada"}
                        </div>
                      </div>
                    </>
                  )}
                  <div className="bg-surface2 border border-border rounded-lg px-3 py-2 col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-inkfaint">Gestor responsável</div>
                    <div className="text-sm text-ink mt-0.5">{c.gestor?.name || "—"}</div>
                  </div>
                </div>

                {c.notes && (
                  <div className="bg-surface2 border border-border rounded-lg px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-inkfaint mb-1">Observações</div>
                    <div className="text-sm text-inksoft whitespace-pre-wrap">{c.notes}</div>
                  </div>
                )}

                <Link href={`/dashboard/clientes/${c.id}`} onClick={() => setInfoClientId(null)}
                  className="block text-center bg-accent text-white text-sm font-medium py-2.5 rounded-lg hover:bg-accentink transition">
                  Ver página completa do cliente
                </Link>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardShell>
  );
}
