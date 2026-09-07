"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, AdminStatusPill } from "../../lib/adminFormat";

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AdminProLabore() {
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ proLaboreValue: "", proLaboreDay: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/admin/pro-labore?month=${month}`));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  function openEdit(row) {
    setEditingId(row.userId);
    setEditForm({ proLaboreValue: row.proLaboreValue ?? "", proLaboreDay: row.proLaboreDay ?? "" });
  }

  async function saveConfig(row) {
    setSaving(true);
    try {
      await api(`/api/admin/pro-labore/${row.userId}`, {
        method: "PATCH",
        body: { proLaboreValue: editForm.proLaboreValue !== "" ? Number(editForm.proLaboreValue) : null, proLaboreDay: editForm.proLaboreDay !== "" ? Number(editForm.proLaboreDay) : null },
      });
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function lancar(row) {
    setBusyId(row.userId);
    try {
      await api(`/api/admin/pro-labore/${row.userId}/lancar`, { method: "POST", body: { month } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function marcarPago(row) {
    setBusyId(row.userId);
    try {
      await api(`/api/admin/despesas/${row.lancamento.id}`, { method: "PATCH", body: { status: "PAGO" } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-sm text-ink">Pró-labore</h3>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Sócio</th>
                <th className="px-4 py-2.5">Valor mensal</th>
                <th className="px-4 py-2.5">Dia</th>
                <th className="px-4 py-2.5">Lançamento do mês</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && data?.rows.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Nenhum sócio cadastrado.</td></tr>)}
              {data?.rows.map((r) => (
                <tr key={r.userId} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  {editingId === r.userId ? (
                    <>
                      <td className="px-4 py-2.5">
                        <input type="number" step="0.01" min="0" value={editForm.proLaboreValue} onChange={(e) => setEditForm({ ...editForm, proLaboreValue: e.target.value })}
                          className="w-28 bg-surface2 border border-border rounded-lg px-2 py-1 text-sm text-ink mono focus:outline-none focus:border-accent" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="1" max="31" value={editForm.proLaboreDay} onChange={(e) => setEditForm({ ...editForm, proLaboreDay: e.target.value })}
                          className="w-16 bg-surface2 border border-border rounded-lg px-2 py-1 text-sm text-ink mono focus:outline-none focus:border-accent" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 mono text-ink">{r.proLaboreValue ? currency(r.proLaboreValue) : "—"}</td>
                      <td className="px-4 py-2.5 mono text-inksoft">{r.proLaboreDay || "—"}</td>
                    </>
                  )}
                  <td className="px-4 py-2.5">
                    {r.lancamento ? (
                      <div className="flex items-center gap-2">
                        <span className="mono text-inksoft">{currency(r.lancamento.amount)}</span>
                        <AdminStatusPill status={r.lancamento.status} />
                      </div>
                    ) : <span className="text-inkfaint text-[12px]">ainda não lançado</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {editingId === r.userId ? (
                        <>
                          <button disabled={saving} onClick={() => saveConfig(r)} className="text-[11.5px] font-semibold px-2 py-1 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Salvar</button>
                          <button onClick={() => setEditingId(null)} className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Cancelar</button>
                        </>
                      ) : (
                        <button onClick={() => openEdit(r)} className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Definir valor</button>
                      )}
                      {!r.lancamento && (
                        <button disabled={busyId === r.userId || !r.proLaboreValue} onClick={() => lancar(r)}
                          title={!r.proLaboreValue ? "Defina o valor primeiro" : ""}
                          className="text-[11.5px] font-semibold px-2 py-1 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-50">Lançar</button>
                      )}
                      {r.lancamento && r.lancamento.status !== "PAGO" && (
                        <button disabled={busyId === r.userId} onClick={() => marcarPago(r)} className="text-[11.5px] font-semibold px-2 py-1 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Marcar pago</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        Pró-labore é separado de Distribuição de Lucros (aba ao lado) — um é a remuneração fixa mensal de cada sócio, o outro é a divisão do lucro apurado. Lançar aqui cria uma despesa (categoria Pró-labore), visível também em Despesas e no Fluxo de caixa.
      </div>
    </div>
  );
}
