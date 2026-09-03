"use client";

import { useEffect, useState, useCallback } from "react";
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

const STATUS_LABEL = {
  ATIVO: "Ativo",
  PENDENTE_PAGAMENTO: "Pendente",
  ONBOARDING: "Onboarding",
  CANCELADO: "Cancelado",
};

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === "CONCLUIDA") return false;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("clientes");
  const [navOpen, setNavOpen] = useState(false);

  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [gestores, setGestores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newClient, setNewClient] = useState({ name: "", niche: "", plan: "", monthlyValue: "", gestorId: "", optimizationDay: "" });
  const [newTask, setNewTask] = useState({ title: "", clientId: "", priority: "MEDIA", dueDate: "" });

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
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  async function createTask(e) {
    e.preventDefault();
    try {
      await api("/api/tasks", { method: "POST", body: newTask });
      setNewTask({ title: "", clientId: "", priority: "MEDIA", dueDate: "" });
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

  if (!user) return null;

  const canSeeCarteira = user.role !== "ATENDENTE";
  const canSeeAtendimento = user.role === "SOCIO" || user.role === "ATENDENTE";
  const canSeeUsuarios = user.role === "SOCIO";
  const canSeeRelatorios = user.role === "SOCIO";
  const canSeeAssistentes = user.role === "SOCIO" || user.role === "GESTOR";
  const canSeeCampanhas = user.role === "SOCIO" || user.role === "GESTOR";

  const ativos = clients.filter((c) => c.status === "ATIVO").length;
  const pendentes = clients.filter((c) => c.status === "PENDENTE_PAGAMENTO").length;
  const tarefasAbertas = tasks.filter((t) => t.status !== "CONCLUIDA").length;
  const todayOfMonth = new Date().getDate();
  const optimizacoesAtrasadas = clients.filter(
    (c) => c.status === "ATIVO" && c.optimizationDay && todayOfMonth >= c.optimizationDay
  );

  const NAV_ITEMS = [
    canSeeCarteira && { key: "clientes", label: "Clientes" },
    canSeeCarteira && { key: "tarefas", label: "Tarefas" },
    canSeeAtendimento && { key: "atendimento", label: "CRM de atendimento" },
    canSeeCampanhas && { key: "campanhas", label: "Campanhas" },
    canSeeRelatorios && { key: "relatorios", label: "Relatórios" },
    canSeeAssistentes && { key: "assistentes", label: "Assistentes IA" },
    canSeeUsuarios && { key: "usuarios", label: "Usuários" },
  ].filter(Boolean);

  function selectTab(key) {
    setTab(key);
    setNavOpen(false);
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-sidebar border-b border-border px-4 py-3">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Abrir menu"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SIDEBAR_SRC} alt="TurbinaADS" className="h-6 w-auto" />
        <div className="w-9" />
      </div>

      {/* Mobile backdrop */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setNavOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 lg:w-56 shrink-0 bg-sidebar text-[#d9cfc2] p-5 flex flex-col gap-7 border-r border-border
          fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0
          ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_SIDEBAR_SRC} alt="TurbinaADS" className="h-8 w-auto" />
          <button onClick={() => setNavOpen(false)} className="lg:hidden text-[#8a8175] text-lg leading-none px-1">✕</button>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[#8a8175] -mt-4 px-1">Painel interno</div>

        <nav className="flex flex-col gap-1 text-sm overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => selectTab(item.key)}
              className={`text-left px-2.5 py-2 rounded-lg font-medium transition ${
                tab === item.key ? "bg-accent/15 text-accent" : "hover:bg-white/5 text-[#d9cfc2]"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="text-[10px] uppercase tracking-wide text-[#8a8175] px-2.5 pt-3 pb-1">Em breve</div>
          <div className="px-2.5 py-2 text-[#6b6559] flex items-center gap-2">
            Bot WhatsApp
            <span className="ml-auto text-[9px] uppercase bg-white/5 px-1.5 py-0.5 rounded-full">Fase 4</span>
          </div>
        </nav>

        <div className="mt-auto text-xs text-[#8a8175]">
          <div className="text-white text-[13px] font-medium mb-0.5">{user.name}</div>
          <div className="mb-3">{user.role === "SOCIO" ? "Sócio" : user.role === "GESTOR" ? "Gestor de tráfego" : "Atendente"}</div>
          <button onClick={logout} className="underline hover:text-accent">Sair</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 text-sm text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>
        )}

        {canSeeCarteira && (tab === "clientes" || tab === "tarefas") && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 mb-5">
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Clientes ativos</div>
                <div className="font-display font-bold text-2xl mono mt-1 text-ink">{loading ? "—" : ativos}</div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Pendentes de pagamento</div>
                <div className="font-display font-bold text-2xl mono mt-1 text-ink">{loading ? "—" : pendentes}</div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Tarefas em aberto</div>
                <div className="font-display font-bold text-2xl mono mt-1 text-ink">{loading ? "—" : tarefasAbertas}</div>
              </div>
              <div className={`rounded-xl p-4 shadow-sm border ${optimizacoesAtrasadas.length > 0 ? "bg-dangersoft border-danger/40" : "bg-surface border-border"}`}>
                <div className={`text-[11px] uppercase tracking-wide ${optimizacoesAtrasadas.length > 0 ? "text-danger" : "text-inkfaint"}`}>Otimizações no prazo/atrasadas</div>
                <div className={`font-display font-bold text-2xl mono mt-1 ${optimizacoesAtrasadas.length > 0 ? "text-danger" : "text-ink"}`}>{loading ? "—" : optimizacoesAtrasadas.length}</div>
              </div>
            </div>

            {optimizacoesAtrasadas.length > 0 && (
              <div className="mb-6 bg-dangersoft border border-danger/30 rounded-xl px-4 py-3">
                <div className="text-xs font-semibold text-danger uppercase tracking-wide mb-1.5">Dia de otimização vencido este mês</div>
                <div className="flex flex-wrap gap-2">
                  {optimizacoesAtrasadas.map((c) => (
                    <Link key={c.id} href={`/dashboard/clientes/${c.id}`}
                      className="text-xs bg-danger/15 text-danger px-2.5 py-1 rounded-full hover:bg-danger/25 transition">
                      {c.name} · dia {c.optimizationDay}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "clientes" && canSeeCarteira && (
          <section className="space-y-6">
            {user.role === "SOCIO" && (
              <form onSubmit={createClient} className="bg-surface border border-border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 items-end">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] text-inkfaint mb-1">Nome do cliente</label>
                  <input required value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Nicho</label>
                  <input value={newClient.niche} onChange={(e) => setNewClient({ ...newClient, niche: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Plano</label>
                  <input value={newClient.plan} onChange={(e) => setNewClient({ ...newClient, plan: e.target.value })}
                    placeholder="R$ 297/mês" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Gestor</label>
                  <select value={newClient.gestorId} onChange={(e) => setNewClient({ ...newClient, gestorId: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
                    <option value="">—</option>
                    {gestores.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Dia de otimização</label>
                  <input type="number" min="1" max="31" value={newClient.optimizationDay}
                    onChange={(e) => setNewClient({ ...newClient, optimizationDay: e.target.value })}
                    placeholder="ex: 10" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                </div>
                <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink transition">Adicionar</button>
              </form>
            )}

            <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4.5 py-3 border-b border-border flex items-center justify-between">
                <h2 className="font-display font-semibold text-sm text-ink">Carteira de clientes</h2>
                <span className="text-xs text-inkfaint">{clients.length} clientes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                      <th className="px-4.5 py-2.5">Cliente</th>
                      <th className="px-4.5 py-2.5">Status</th>
                      <th className="px-4.5 py-2.5">Plano</th>
                      <th className="px-4.5 py-2.5">Gestor</th>
                      <th className="px-4.5 py-2.5">Pendências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.id} className="border-t border-border hover:bg-surface2/60 transition">
                        <td className="px-4.5 py-3 min-w-[180px]">
                          <Link href={`/dashboard/clientes/${c.id}`} className="block">
                            <div className="font-medium text-ink hover:text-accent transition">{c.name}</div>
                            <div className="text-xs text-inkfaint">{c.niche || "—"}</div>
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
                    {!loading && clients.length === 0 && (
                      <tr><td colSpan={5} className="px-4.5 py-8 text-center text-inkfaint">Nenhum cliente cadastrado ainda.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "tarefas" && canSeeCarteira && (
          <section className="space-y-6">
            <form onSubmit={createTask} className="bg-surface border border-border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
              <TaskTitleField className="lg:col-span-2" value={newTask.title} onChange={(v) => setNewTask({ ...newTask, title: v })} />
              <div>
                <label className="block text-[11px] text-inkfaint mb-1">Cliente</label>
                <select required value={newTask.clientId} onChange={(e) => setNewTask({ ...newTask, clientId: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
                  <option value="">Selecione</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-inkfaint mb-1">Prioridade</label>
                <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-inkfaint mb-1">Prazo</label>
                <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
              </div>
              <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink transition">Adicionar</button>
            </form>

            <div className="bg-surface border border-border rounded-xl shadow-sm divide-y divide-border">
              {tasks.map((t) => {
                const overdue = isOverdue(t.dueDate, t.status);
                return (
                  <label key={t.id} className="flex items-center gap-3 px-4.5 py-3 cursor-pointer">
                    <input type="checkbox" checked={t.status === "CONCLUIDA"} onChange={() => toggleTaskStatus(t)} className="accent-accent w-4 h-4 shrink-0" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === "ALTA" ? "bg-danger" : t.priority === "MEDIA" ? "bg-warning" : "bg-inkfaint"}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${t.status === "CONCLUIDA" ? "line-through text-inkfaint" : "text-ink"}`}>{t.title}</div>
                      <div className="text-xs text-inkfaint truncate">{t.client?.name}{t.gestor ? ` · ${t.gestor.name}` : ""}</div>
                    </div>
                    <div className={`text-xs mono shrink-0 ${overdue ? "text-danger font-semibold" : "text-inksoft"}`}>
                      {overdue ? "atrasada · " : ""}{fmtDate(t.dueDate)}
                    </div>
                  </label>
                );
              })}
              {!loading && tasks.length === 0 && <div className="px-4.5 py-8 text-center text-inkfaint">Nenhuma tarefa por aqui.</div>}
            </div>
          </section>
        )}

        {tab === "atendimento" && canSeeAtendimento && <CRM />}
        {tab === "campanhas" && canSeeCampanhas && <Campaigns />}
        {tab === "relatorios" && canSeeRelatorios && <Reports />}
        {tab === "assistentes" && canSeeAssistentes && <AIAssistants />}
        {tab === "usuarios" && canSeeUsuarios && <UsersPanel />}
      </main>
    </div>
  );
}
