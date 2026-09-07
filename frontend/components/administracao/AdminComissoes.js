"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

export default function AdminComissoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/comissoes"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalGerado = rows.reduce((s, r) => s + r.totalGerado, 0);
  const totalSaldo = rows.reduce((s, r) => s + r.saldo, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Comissão total gerada</div>
          <div className="text-xl font-display font-semibold mono mt-1 text-ink">{currency(totalGerado)}</div>
        </div>
        <div className="bg-surface border border-border rounded-2xl px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inkfaint">Saldo em aberto (a pagar)</div>
          <div className="text-xl font-display font-semibold mono mt-1 text-warning">{currency(totalSaldo)}</div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Pessoa</th>
                <th className="px-4 py-2.5">Serviços aceitos</th>
                <th className="px-4 py-2.5">Total gerado</th>
                <th className="px-4 py-2.5">Já sacado</th>
                <th className="px-4 py-2.5">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-inkfaint">Nenhuma comissão gerada ainda.</td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.servicosAceitos}</td>
                  <td className="px-4 py-2.5 mono text-ink">{currency(r.totalGerado)}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{currency(r.totalSacado)}</td>
                  <td className="px-4 py-2.5 mono text-warning font-semibold">{currency(r.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        Visão consolidada da mesma comissão por serviço aceito que já existe na aba Financeiro (saques são aprovados por lá) — reunida aqui pra o sócio-contador acompanhar junto do resto da Administração. Preparado pra somar comissão de SDR/Closer quando esses papéis existirem no sistema.
      </div>
    </div>
  );
}
