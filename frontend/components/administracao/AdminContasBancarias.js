"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

const TYPE_OPTIONS = [
  { value: "CORRENTE", label: "Conta corrente" },
  { value: "POUPANCA", label: "Poupança" },
  { value: "CARTEIRA_DIGITAL", label: "Carteira digital" },
  { value: "OUTRO", label: "Outro" },
];
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

function emptyForm() {
  return { name: "", bank: "", type: "CORRENTE", initialBalance: "", notes: "" };
}

export default function AdminContasBancarias() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/contas-bancarias"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ name: r.name, bank: r.bank || "", type: r.type || "CORRENTE", initialBalance: r.initialBalance ?? "", notes: r.notes || "" });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Preencha o nome da conta.");
    setSaving(true);
    const body = {
      name: form.name.trim(), bank: form.bank || null, type: form.type,
      initialBalance: form.initialBalance !== "" ? Number(form.initialBalance) : 0,
      notes: form.notes || null,
    };
    try {
      if (editing) await api(`/api/admin/contas-bancarias/${editing.id}`, { method: "PATCH", body });
      else await api("/api/admin/contas-bancarias", { method: "POST", body });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function inativar(r) {
    if (!confirm(`Inativar a conta "${r.name}"?`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/contas-bancarias/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const totalConsolidado = rows.filter((r) => r.status === "ATIVA").reduce((s, r) => s + (r.saldoEstimado || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase text-inkfaint">Saldo consolidado (estimado)</div>
          <div className="mono text-ink font-semibold">{currency(totalConsolidado)}</div>
        </div>
        <button onClick={openNew} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Nova conta</button>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        Saldo estimado = saldo inicial informado + receitas pagas − despesas pagas, casadas pelo nome da conta (mesmo texto usado em Receitas/Despesas). Não é integração bancária real — ninguém consulta o banco automaticamente.
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Conta</th>
                <th className="px-4 py-2.5">Banco</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Saldo estimado</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Nenhuma conta cadastrada ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border cursor-pointer hover:bg-white/[0.03] transition" onClick={() => openEdit(r)}>
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.bank || "—"}</td>
                  <td className="px-4 py-2.5 text-inksoft">{TYPE_LABEL[r.type] || r.type}</td>
                  <td className="px-4 py-2.5 mono text-ink">{currency(r.saldoEstimado)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${r.status === "ATIVA" ? "bg-successsoft text-success" : "bg-white/5 text-inkfaint line-through"}`}>{r.status === "ATIVA" ? "Ativa" : "Inativa"}</span>
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {r.status === "ATIVA" && (
                      <button disabled={busyId === r.id} onClick={() => inativar(r)}
                        className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Inativar</button>
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
              <h3 className="font-display font-semibold text-ink">{editing ? "Editar conta" : "Nova conta bancária"}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: PJ Nubank, PicPay agência"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                <p className="text-[10.5px] text-inkfaint mt-1">Use o mesmo nome no campo "conta" das receitas/despesas pra entrar no saldo.</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Banco</label>
                  <input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Tipo</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Saldo inicial (R$)</label>
                <input type="number" step="0.01" value={form.initialBalance} onChange={(e) => setForm({ ...form, initialBalance: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
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
