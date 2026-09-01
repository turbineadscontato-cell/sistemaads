"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getUser } from "../../../../lib/api";

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

export default function ClientDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [client, setClient] = useState(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [newPayment, setNewPayment] = useState({ amount: "", dueDate: "" });
  const [newPendency, setNewPendency] = useState({ description: "", type: "" });
  const [newTask, setNewTask] = useState({ title: "", dueDate: "", priority: "MEDIA" });

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace("/"); return; }
    setUser(u);
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
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <p className="text-danger text-sm mb-3">{error}</p>
          <Link href="/dashboard" className="text-accent text-sm hover:underline">← Voltar ao painel</Link>
        </div>
      </div>
    );
  }
  if (!client || !user) return null;

  const canEdit = user.role === "SOCIO";
  const canNotes = user.role === "SOCIO" || (user.role === "GESTOR" && client.gestorId === user.id);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <Link href="/dashboard" className="text-xs text-inkfaint hover:text-accent">← Voltar aos clientes</Link>

        <div className="flex items-center justify-between mt-3 mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-ink">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`pill pill-${client.status}`}>{STATUS_LABEL[client.status]}</span>
              <span className="text-xs text-inkfaint">{client.niche || "nicho não informado"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3.5 mb-6">
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Plano</div>
            <div className="font-display font-semibold text-base mt-1 text-ink">{client.plan || "—"}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Valor mensal</div>
            <div className="font-display font-semibold text-base mt-1 mono text-accent">{currency(client.monthlyValue)}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Verba diária de anúncios</div>
            <div className="font-display font-semibold text-base mt-1 mono text-ink">{currency(client.dailyAdBudget)}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-inkfaint">Gestor responsável</div>
            <div className="font-display font-semibold text-base mt-1 text-ink">{client.gestor?.name || "—"}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
                <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <div className="mono text-ink">{currency(p.amount)}</div>
                    <div className="text-[10.5px] text-inkfaint">vence {fmtDate(p.dueDate)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium ${p.status === "PAGO" ? "bg-successsoft text-success" : p.status === "ATRASADO" ? "bg-dangersoft text-danger" : "bg-warningsoft text-warning"}`}>
                      {PAYMENT_LABEL[p.status]}
                    </span>
                    {canEdit && p.status !== "PAGO" && (
                      <button onClick={() => markPaid(p)} className="text-[10.5px] text-accent hover:underline">marcar pago</button>
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
            <form onSubmit={addTask} className="flex gap-2 p-3 border-b border-border">
              <input required placeholder="Nova tarefa" value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
              <input type="date" value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="w-28 px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
              <button className="bg-accent text-white text-xs font-medium px-3 rounded-md hover:bg-accentink">+</button>
            </form>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {client.tasks.map((t) => (
                <label key={t.id} className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={t.status === "CONCLUIDA"} onChange={() => toggleTask(t)} className="accent-accent w-3.5 h-3.5" />
                  <span className={`text-sm flex-1 ${t.status === "CONCLUIDA" ? "line-through text-inkfaint" : "text-ink"}`}>{t.title}</span>
                  <span className="text-[10.5px] text-inkfaint mono">{fmtDate(t.dueDate)}</span>
                </label>
              ))}
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
              <button className="bg-accent text-white text-xs font-medium px-3 rounded-md hover:bg-accentink">+</button>
            </form>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {client.pendencies.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={p.status === "RESOLVIDA"} onChange={() => togglePendency(p)} className="accent-accent w-3.5 h-3.5" />
                  <div className={`flex-1 ${p.status === "RESOLVIDA" ? "text-inkfaint line-through" : "text-ink"}`}>
                    <div className="text-sm">{p.description}</div>
                    {p.type && <div className="text-[10.5px] text-inkfaint">{p.type}</div>}
                  </div>
                </label>
              ))}
              {client.pendencies.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Sem pendências.</div>}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Anotações</div>
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
        </div>
      </div>
    </div>
  );
}
