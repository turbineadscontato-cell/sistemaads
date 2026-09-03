"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getUser } from "../../../../lib/api";
import TaskTitleField from "../../../../components/TaskTitleField";
import ClientFiles from "../../../../components/ClientFiles";
import ClientReports from "../../../../components/ClientReports";
import ClientLeadsBoard from "../../../../components/ClientLeadsBoard";
import ContentCalendar from "../../../../components/ContentCalendar";

const STATUS_LABEL = { ATIVO: "Ativo", PENDENTE_PAGAMENTO: "Pendente", ONBOARDING: "Onboarding", CANCELADO: "Cancelado" };
const PAYMENT_LABEL = { PAGO: "Pago", PENDENTE: "Pendente", ATRASADO: "Atrasado" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}
function currency(n) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function isOverdue(dueDate, status) {
  if (!dueDate || status === "CONCLUIDA") return false;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export default function ClientDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [client, setClient] = useState(null);
  const [gestores, setGestores] = useState([]);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [newPayment, setNewPayment] = useState({ amount: "", dueDate: "" });
  const [newPendency, setNewPendency] = useState({ description: "", type: "" });
  const [newTask, setNewTask] = useState({ title: "", dueDate: "", priority: "MEDIA" });

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace("/"); return; }
    if (u.role === "CLIENTE") { router.replace("/portal"); return; }
    if (u.role === "PACIENTE") { router.replace("/paciente-portal"); return; }
    setUser(u);
    if (u.role === "SOCIO") api("/api/users/gestores").then(setGestores).catch(() => {});
  }, [router]);

  const load = useCallback(async () => {
    try {
      const c = await api(`/api/clients/${id}`);
      setClient(c);
      setNotes(c.notes || "");
    } catch (err) {
      setError(err.message || "Cliente não encontrado.");
    }
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api(`/api/clients/${id}`, { method: "PATCH", body: { notes } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingNotes(false);
    }
  }

  function startEdit() {
    setEditForm({
      name: client.name || "",
      niche: client.niche || "",
      status: client.status,
      plan: client.plan || "",
      monthlyValue: client.monthlyValue ?? "",
      dailyAdBudget: client.dailyAdBudget ?? "",
      gestorId: client.gestorId || "",
      optimizationDay: client.optimizationDay ?? "",
      activeCreative: client.activeCreative || "",
      planType: client.planType || "COMPLETO",
    });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const body = user.role === "SOCIO"
        ? {
            ...editForm,
            monthlyValue: editForm.monthlyValue !== "" ? Number(editForm.monthlyValue) : null,
            dailyAdBudget: editForm.dailyAdBudget !== "" ? Number(editForm.dailyAdBudget) : null,
            gestorId: editForm.gestorId || null,
            optimizationDay: editForm.optimizationDay !== "" ? Number(editForm.optimizationDay) : null,
          }
        : {
            optimizationDay: editForm.optimizationDay !== "" ? Number(editForm.optimizationDay) : null,
            activeCreative: editForm.activeCreative,
          };
      await api(`/api/clients/${id}`, { method: "PATCH", body });
      setEditing(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function addPayment(e) {
    e.preventDefault();
    try {
      await api("/api/payments", { method: "POST", body: { clientId: id, amount: Number(newPayment.amount), dueDate: newPayment.dueDate } });
      setNewPayment({ amount: "", dueDate: "" });
      load();
    } catch (err) { alert(err.message); }
  }

  async function markPaid(p) {
    await api(`/api/payments/${p.id}`, { method: "PATCH", body: { status: "PAGO", paidDate: new Date().toISOString() } });
    load();
  }

  async function addPendency(e) {
    e.preventDefault();
    try {
      await api("/api/pendencies", { method: "POST", body: { clientId: id, description: newPendency.description, type: newPendency.type } });
      setNewPendency({ description: "", type: "" });
      load();
    } catch (err) { alert(err.message); }
  }

  async function togglePendency(p) {
    await api(`/api/pendencies/${p.id}`, { method: "PATCH", body: { status: p.status === "ABERTA" ? "RESOLVIDA" : "ABERTA" } });
    load();
  }

  async function addTask(e) {
    e.preventDefault();
    try {
      await api("/api/tasks", { method: "POST", body: { ...newTask, clientId: id } });
      setNewTask({ title: "", dueDate: "", priority: "MEDIA" });
      load();
    } catch (err) { alert(err.message); }
  }

  async function toggleTask(t) {
    await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "CONCLUIDA" ? "PENDENTE" : "CONCLUIDA" } });
    load();
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="text-center">
          <p className="text-danger text-sm mb-3">{error}</p>
          <Link href="/dashboard" className="text-accent text-sm hover:underline">← Voltar ao painel</Link>
        </div>
      </div>
    );
  }
  if (!client || !user) return null;

  const canEdit = user.role === "SOCIO";
  const canOperate = user.role === "SOCIO" || (user.role === "GESTOR" && client.gestorId === user.id);
  const canNotes = canOperate;
  const isSoSistema = client.planType === "SO_SISTEMA";

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/dashboard" className="text-xs text-inkfaint hover:text-accent">← Voltar aos clientes</Link>

        <div className="flex flex-wrap items-start justify-between gap-3 mt-3 mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-ink">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`pill pill-${client.status}`}>{STATUS_LABEL[client.status]}</span>
              <span className="text-xs text-inkfaint">{client.niche || "nicho não informado"}</span>
              {isSoSistema && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-surface2 text-inksoft border border-border">Só sistema</span>
              )}
            </div>
          </div>
          {canOperate && !editing && (
            <button onClick={startEdit} className="text-xs border border-border rounded-md px-3 py-1.5 text-inksoft hover:border-accent hover:text-accent transition shrink-0">
              Editar cliente
            </button>
          )}
        </div>

        {editing && editForm && (
          <form onSubmit={saveEdit} className="bg-surface border border-accent/30 rounded-xl p-4 shadow-sm mb-6 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Editar cliente</div>
            {canEdit ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Nome</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Nicho</label>
                  <input value={editForm.niche} onChange={(e) => setEditForm({ ...editForm, niche: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Status</label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
                    <option value="ONBOARDING">Onboarding</option>
                    <option value="ATIVO">Ativo</option>
                    <option value="PENDENTE_PAGAMENTO">Pendente de pagamento</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Plano</label>
                  <input value={editForm.plan} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                    placeholder="R$ 297/mês" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Tipo de plano</label>
                  <select value={editForm.planType} onChange={(e) => setEditForm({ ...editForm, planType: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
                    <option value="COMPLETO">Completo (tráfego + sistema)</option>
                    <option value="SO_SISTEMA">Só sistema (cancelou o tráfego)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Valor mensal</label>
                  <input type="number" step="0.01" value={editForm.monthlyValue} onChange={(e) => setEditForm({ ...editForm, monthlyValue: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Verba diária de anúncios</label>
                  <input type="number" step="0.01" value={editForm.dailyAdBudget} onChange={(e) => setEditForm({ ...editForm, dailyAdBudget: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Gestor responsável</label>
                  <select value={editForm.gestorId} onChange={(e) => setEditForm({ ...editForm, gestorId: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
                    <option value="">—</option>
                    {gestores.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Dia de otimização</label>
                  <input type="number" min="1" max="31" value={editForm.optimizationDay} onChange={(e) => setEditForm({ ...editForm, optimizationDay: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Criativo ativo</label>
                  <input value={editForm.activeCreative} onChange={(e) => setEditForm({ ...editForm, activeCreative: e.target.value })}
                    placeholder="ex: Vídeo depoimento v3" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
              </div>
            ) : isSoSistema ? (
              <p className="text-xs text-inkfaint">Esse cliente está no plano só sistema — sem campos de tráfego pago para editar aqui.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Dia de otimização</label>
                  <input type="number" min="1" max="31" value={editForm.optimizationDay} onChange={(e) => setEditForm({ ...editForm, optimizationDay: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
                </div>
                <div>
                  <label className="block text-[11px] text-inkfaint mb-1">Criativo ativo</label>
                  <input value={editForm.activeCreative} onChange={(e) => setEditForm({ ...editForm, activeCreative: e.target.value })}
                    placeholder="ex: Vídeo depoimento v3" className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button disabled={savingEdit} className="bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
                {savingEdit ? "Salvando…" : "Salvar alterações"}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-inkfaint hover:text-ink px-3 py-1.5">Cancelar</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5 mb-6">
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Plano</div>
            <div className="font-display font-semibold text-base mt-1 text-ink">{client.plan || "—"}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Valor mensal</div>
            <div className="font-display font-semibold text-base mt-1 mono text-accent">{currency(client.monthlyValue)}</div>
          </div>
          {!isSoSistema && (
            <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-inkfaint">Verba diária</div>
              <div className="font-display font-semibold text-base mt-1 mono text-ink">{currency(client.dailyAdBudget)}</div>
            </div>
          )}
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Gestor</div>
            <div className="font-display font-semibold text-base mt-1 text-ink truncate">{client.gestor?.name || "—"}</div>
          </div>
          {!isSoSistema && (
            <>
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Dia de otimização</div>
                <div className="font-display font-semibold text-base mt-1 mono text-ink">{client.optimizationDay || "—"}</div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Criativo ativo</div>
                <div className="font-display font-semibold text-base mt-1 text-ink truncate">{client.activeCreative || "—"}</div>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Payments */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Pagamentos</div>
            {canEdit && (
              <form onSubmit={addPayment} className="flex gap-2 p-3 border-b border-border">
                <input required type="number" step="0.01" placeholder="Valor" value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  className="w-24 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
                <input required type="date" value={newPayment.dueDate}
                  onChange={(e) => setNewPayment({ ...newPayment, dueDate: e.target.value })}
                  className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                <button className="bg-accent text-white text-xs font-medium px-3 rounded-md hover:bg-accentink">+</button>
              </form>
            )}
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {client.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <div className="mono text-ink">{currency(p.amount)}</div>
                    <div className="text-[10.5px] text-inkfaint">vence {fmtDate(p.dueDate)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${p.status === "PAGO" ? "bg-successsoft text-success" : p.status === "ATRASADO" ? "bg-dangersoft text-danger" : "bg-warningsoft text-warning"}`}>
                      {PAYMENT_LABEL[p.status]}
                    </span>
                    {canEdit && p.status !== "PAGO" && (
                      <button onClick={() => markPaid(p)} className="text-[10.5px] text-accent hover:underline whitespace-nowrap">marcar pago</button>
                    )}
                  </div>
                </div>
              ))}
              {client.payments.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Sem pagamentos registrados.</div>}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Tarefas</div>
            <form onSubmit={addTask} className="flex flex-col sm:flex-row gap-2 p-3 border-b border-border">
              <TaskTitleField className="flex-1" value={newTask.title} onChange={(v) => setNewTask({ ...newTask, title: v })} />
              <div className="flex gap-2">
                <input type="date" value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="w-28 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
                <button className="bg-accent text-white text-xs font-medium px-3 rounded-md hover:bg-accentink shrink-0">+</button>
              </div>
            </form>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {client.tasks.map((t) => {
                const overdue = isOverdue(t.dueDate, t.status);
                return (
                  <label key={t.id} className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={t.status === "CONCLUIDA"} onChange={() => toggleTask(t)} className="accent-accent w-3.5 h-3.5 shrink-0" />
                    <span className={`text-sm flex-1 min-w-0 truncate ${t.status === "CONCLUIDA" ? "line-through text-inkfaint" : "text-ink"}`}>{t.title}</span>
                    <span className={`text-[10.5px] mono shrink-0 ${overdue ? "text-danger font-semibold" : "text-inkfaint"}`}>{overdue ? "atrasada · " : ""}{fmtDate(t.dueDate)}</span>
                  </label>
                );
              })}
              {client.tasks.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Sem tarefas.</div>}
            </div>
          </div>

          {/* Pendencies */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Pendências</div>
            <form onSubmit={addPendency} className="flex gap-2 p-3 border-b border-border">
              <input required placeholder="Descrição" value={newPendency.description}
                onChange={(e) => setNewPendency({ ...newPendency, description: e.target.value })}
                className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
              <input placeholder="Tipo" value={newPendency.type}
                onChange={(e) => setNewPendency({ ...newPendency, type: e.target.value })}
                className="w-24 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
              <button className="bg-accent text-white text-xs font-medium px-3 rounded-md hover:bg-accentink shrink-0">+</button>
            </form>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {client.pendencies.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={p.status === "RESOLVIDA"} onChange={() => togglePendency(p)} className="accent-accent w-3.5 h-3.5 shrink-0" />
                  <div className={`flex-1 min-w-0 ${p.status === "RESOLVIDA" ? "text-inkfaint line-through" : "text-ink"}`}>
                    <div className="text-sm truncate">{p.description}</div>
                    {p.type && <div className="text-[10.5px] text-inkfaint">{p.type}</div>}
                  </div>
                </label>
              ))}
              {client.pendencies.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Sem pendências.</div>}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Anotações internas</div>
            <div className="p-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canNotes}
                rows={6}
                placeholder={canNotes ? "Anotações internas sobre o cliente…" : "Sem permissão para editar."}
                className="w-full px-2.5 py-2 text-sm rounded-md border border-border bg-surface2 text-ink disabled:opacity-60 resize-none"
              />
              {canNotes && (
                <button onClick={saveNotes} disabled={savingNotes}
                  className="mt-2 bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
                  {savingNotes ? "Salvando…" : "Salvar anotações"}
                </button>
              )}
            </div>
          </div>

          <ClientFiles clientId={id} canManage={canOperate} showScriptGenerator={canOperate} allowClientUpload={false} />
          {!isSoSistema && <ClientReports clientId={id} canManage={canOperate} />}
          <ClientLeadsBoard clientId={id} canEdit={canOperate} />
        </div>

        <div className="mt-4">
          <ContentCalendar clientId={id} />
        </div>
      </div>
    </div>
  );
}
