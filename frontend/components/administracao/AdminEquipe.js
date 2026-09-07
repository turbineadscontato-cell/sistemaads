"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, EMPLOYEE_TYPE_OPTIONS, EMPLOYEE_STATUS_LABEL } from "../../lib/adminFormat";

const STATUS_CLASS = { ATIVO: "bg-successsoft text-success", INATIVO: "bg-white/5 text-inksoft", DESLIGADO: "bg-dangersoft text-danger" };

function emptyForm() {
  return { name: "", role: "", type: "CLT", email: "", phone: "", startDate: "", status: "ATIVO", paymentValue: "", paymentDay: "", notes: "", userId: "" };
}

export default function AdminEquipe() {
  const [rows, setRows] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, u] = await Promise.all([api("/api/admin/equipe"), api("/api/admin/equipe-usuarios")]);
      setRows(e);
      setUsuarios(u);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const usuariosDisponiveis = useMemo(() => {
    const linkedIds = new Set(rows.filter((r) => r.user && (!editing || r.id !== editing.id)).map((r) => r.user.id));
    return usuarios.filter((u) => !linkedIds.has(u.id));
  }, [usuarios, rows, editing]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(r) {
    setEditing(r);
    setForm({
      name: r.name, role: r.role || "", type: r.type, email: r.email || "", phone: r.phone || "",
      startDate: r.startDate ? String(r.startDate).slice(0, 10) : "", status: r.status,
      paymentValue: r.paymentValue ?? "", paymentDay: r.paymentDay ?? "", notes: r.notes || "",
      userId: r.user?.id || "",
    });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Preencha o nome.");
    setSaving(true);
    const body = {
      name: form.name.trim(),
      role: form.role || null,
      type: form.type,
      email: form.email || null,
      phone: form.phone || null,
      startDate: form.startDate || null,
      status: form.status,
      paymentValue: form.paymentValue !== "" ? Number(form.paymentValue) : null,
      paymentDay: form.paymentDay !== "" ? Number(form.paymentDay) : null,
      notes: form.notes || null,
      userId: form.userId || null,
    };
    try {
      if (editing) await api(`/api/admin/equipe/${editing.id}`, { method: "PATCH", body });
      else await api("/api/admin/equipe", { method: "POST", body });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function desligar(r) {
    if (!confirm(`Marcar "${r.name}" como desligado? O histórico de pagamentos/contratos dessa pessoa é mantido.`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/equipe/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={openNew} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Novo membro da equipe</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Cargo</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Pagamento</th>
                <th className="px-4 py-2.5">Login vinculado</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={7} className="px-4 py-6 text-center text-inkfaint">Nenhum membro da equipe cadastrado ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border cursor-pointer hover:bg-white/[0.03] transition" onClick={() => openEdit(r)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.role || "—"}</td>
                  <td className="px-4 py-2.5 text-inksoft">{EMPLOYEE_TYPE_OPTIONS.find((t) => t.value === r.type)?.label || r.type}</td>
                  <td className="px-4 py-2.5 mono text-ink">{r.paymentValue ? `${currency(r.paymentValue)}${r.paymentDay ? ` · dia ${r.paymentDay}` : ""}` : "—"}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.user ? r.user.name : "—"}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[r.status]}`}>{EMPLOYEE_STATUS_LABEL[r.status]}</span></td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {r.status !== "DESLIGADO" && (
                      <button disabled={busyId === r.id} onClick={() => desligar(r)}
                        className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Desligar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div onClick={() => setShowForm(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <form onSubmit={save} className="relative w-full sm:max-w-md bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-ink">{editing ? "Editar membro da equipe" : "Novo membro da equipe"}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Cargo</label>
                  <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="ex: Gestor de tráfego"
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Tipo</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {EMPLOYEE_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Telefone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Login vinculado no sistema (opcional)</label>
                <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                  <option value="">Nenhum</option>
                  {usuariosDisponiveis.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor de pagamento (R$/mês)</label>
                  <input type="number" step="0.01" min="0" value={form.paymentValue} onChange={(e) => setForm({ ...form, paymentValue: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Dia do pagamento</label>
                  <input type="number" min="1" max="31" value={form.paymentDay} onChange={(e) => setForm({ ...form, paymentDay: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Início</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                    <option value="DESLIGADO">Desligado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex items-center gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 text-sm font-medium py-2.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 text-sm font-semibold py-2.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
