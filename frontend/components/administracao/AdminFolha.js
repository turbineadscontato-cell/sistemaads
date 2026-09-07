"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, AdminStatusPill, EMPLOYEE_TYPE_OPTIONS } from "../../lib/adminFormat";

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AdminFolha() {
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/admin/folha?month=${month}`));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function lancar(row) {
    setBusyId(row.id);
    try {
      await api(`/api/admin/folha/${row.id}/lancar`, { method: "POST", body: { month } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function marcarPago(row) {
    setBusyId(row.id);
    try {
      await api(`/api/admin/despesas/${row.lancamento.id}`, { method: "PATCH", body: { status: "PAGO" } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const total = data ? data.rows.reduce((s, r) => s + (r.lancamento?.amount || r.paymentValue || 0), 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-sm text-ink">Folha de pagamentos</h3>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
      </div>

      <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
        <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Total da folha (mês selecionado)</div>
        <div className="text-xl font-display font-semibold mono mt-1 text-ink">{currency(total)}</div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Valor mensal</th>
                <th className="px-4 py-2.5">Lançamento do mês</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && data?.rows.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Nenhum membro ativo da equipe cadastrado ainda — cadastre em "Equipe".</td></tr>)}
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}{r.role ? <span className="text-inkfaint"> · {r.role}</span> : null}</td>
                  <td className="px-4 py-2.5 text-inksoft">{EMPLOYEE_TYPE_OPTIONS.find((t) => t.value === r.type)?.label || r.type}</td>
                  <td className="px-4 py-2.5 mono text-ink">{r.paymentValue ? currency(r.paymentValue) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {r.lancamento ? (
                      <div className="flex items-center gap-2">
                        <span className="mono text-inksoft">{currency(r.lancamento.amount)}</span>
                        <AdminStatusPill status={r.lancamento.status} />
                      </div>
                    ) : <span className="text-inkfaint text-[12px]">ainda não lançado</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {!r.lancamento && (
                      <button disabled={busyId === r.id || !r.paymentValue} onClick={() => lancar(r)}
                        title={!r.paymentValue ? "Defina o valor de pagamento na ficha da Equipe primeiro" : ""}
                        className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-50">Lançar pagamento</button>
                    )}
                    {r.lancamento && r.lancamento.status !== "PAGO" && (
                      <button disabled={busyId === r.id} onClick={() => marcarPago(r)}
                        className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Marcar pago</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        Lançar aqui cria uma despesa em "Despesas" (categoria Funcionários/Prestadores), vinculada a essa pessoa — não é um livro separado, é o mesmo lançamento visível na aba Despesas e no Fluxo de caixa.
      </div>
    </div>
  );
}
