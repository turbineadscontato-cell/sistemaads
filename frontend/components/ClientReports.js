"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

function currency(n) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthLabel(m) {
  if (!m) return "—";
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function Metric({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-accent/40 bg-accentsoft" : "border-border bg-surface"}`}>
      <div className="text-[10px] uppercase tracking-wide text-inkfaint">{label}</div>
      <div className={`font-display font-semibold text-base mono mt-0.5 ${highlight ? "text-accent" : "text-ink"}`}>{value}</div>
    </div>
  );
}

// Accepts manual metric entry and/or a pasted/uploaded CSV export from the
// Meta Ads Manager; the backend does a best-effort parse of the CSV and
// manual fields always take priority. Shows a "premium" printable summary
// (custo por lead, taxa de fechamento, ROI) to demonstrate results to the client.
export default function ClientReports({ clientId, canManage }) {
  const [reports, setReports] = useState([]);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ month: "", spend: "", impressions: "", clicks: "", leadsCount: "", fechamentos: "", revenue: "", notes: "" });
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setReports(await api(`/api/monthly-reports/${clientId}`));
    } catch (err) {
      // silent
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCsvPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result));
    reader.readAsText(file);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/monthly-reports/${clientId}`, {
        method: "POST",
        body: { ...form, csvText: csvText || undefined, sourceFileName: csvFileName || undefined },
      });
      setForm({ month: "", spend: "", impressions: "", clicks: "", leadsCount: "", fechamentos: "", revenue: "", notes: "" });
      setCsvText("");
      setCsvFileName("");
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(r) {
    if (!confirm("Remover este relatório?")) return;
    try {
      await api(`/api/monthly-reports/${r.id}`, { method: "DELETE" });
      if (open?.id === r.id) setOpen(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Relatórios mensais</div>

      {canManage && (
        <form onSubmit={submit} className="p-3 border-b border-border space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input required type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink mono" />
            <input type="number" step="0.01" placeholder="Verba gasta" value={form.spend}
              onChange={(e) => setForm({ ...form, spend: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <input type="number" placeholder="Leads/resultados" value={form.leadsCount}
              onChange={(e) => setForm({ ...form, leadsCount: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <input type="number" placeholder="Fechamentos" value={form.fechamentos}
              onChange={(e) => setForm({ ...form, fechamentos: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <input type="number" placeholder="Impressões" value={form.impressions}
              onChange={(e) => setForm({ ...form, impressions: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <input type="number" placeholder="Cliques" value={form.clicks}
              onChange={(e) => setForm({ ...form, clicks: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <input type="number" step="0.01" placeholder="Faturamento gerado" value={form.revenue}
              onChange={(e) => setForm({ ...form, revenue: e.target.value })}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <label className="text-xs bg-surface2 border border-border text-inksoft px-2 py-1.5 rounded-md cursor-pointer text-center hover:border-accent/50 transition truncate">
              {csvFileName || "Importar CSV do Meta Ads"}
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvPick} />
            </label>
          </div>
          <input placeholder="Observações (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
          <button disabled={saving} className="bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
            {saving ? "Salvando…" : "Gerar relatório do mês"}
          </button>
          <p className="text-[10.5px] text-inkfaint">Preencha os campos manualmente e/ou importe um CSV exportado do Gerenciador de Anúncios — campos preenchidos manualmente têm prioridade sobre o CSV.</p>
        </form>
      )}

      <div className="divide-y divide-border max-h-56 overflow-y-auto">
        {reports.map((r) => (
          <button key={r.id} onClick={() => setOpen(r)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left hover:bg-surface2/60 transition">
            <span className="text-ink capitalize">{monthLabel(r.month)}</span>
            <span className="text-inkfaint text-xs mono whitespace-nowrap">{currency(r.spend)} · {r.leadsCount ?? 0} leads · {r.fechamentos ?? 0} fechamentos</span>
          </button>
        ))}
        {reports.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Nenhum relatório gerado ainda.</div>}
      </div>

      {open && (() => {
        const cpl = open.leadsCount ? (open.spend || 0) / open.leadsCount : null;
        const taxaFechamento = open.leadsCount ? ((open.fechamentos || 0) / open.leadsCount) * 100 : null;
        const roi = open.spend ? (((open.revenue || 0) - open.spend) / open.spend) * 100 : null;
        return (
          <div className="border-t border-border p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-inkfaint">Relatório de performance</div>
                <div className="font-display font-bold text-lg text-ink capitalize">{monthLabel(open.month)}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => window.print()} className="text-xs border border-border rounded-md px-3 py-1.5 text-inksoft hover:border-accent hover:text-accent transition">Imprimir / PDF</button>
                {canManage && <button onClick={() => remove(open)} className="text-xs text-danger hover:underline">remover</button>}
                <button onClick={() => setOpen(null)} className="text-xs text-inkfaint hover:text-ink">fechar</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="Verba investida" value={currency(open.spend)} />
              <Metric label="Impressões" value={open.impressions != null ? open.impressions.toLocaleString("pt-BR") : "—"} />
              <Metric label="Cliques" value={open.clicks != null ? open.clicks.toLocaleString("pt-BR") : "—"} />
              <Metric label="Leads gerados" value={open.leadsCount ?? "—"} />
              <Metric label="Fechamentos" value={open.fechamentos ?? "—"} highlight />
              <Metric label="Custo por lead" value={cpl != null ? currency(cpl) : "—"} />
              <Metric label="Taxa de fechamento" value={taxaFechamento != null ? `${taxaFechamento.toFixed(1)}%` : "—"} />
              <Metric label="Faturamento gerado" value={currency(open.revenue)} />
              <Metric label="ROI da campanha" value={roi != null ? `${roi.toFixed(0)}%` : "—"} highlight={roi != null && roi > 0} />
            </div>
            {open.notes && <p className="text-xs text-inksoft">{open.notes}</p>}
          </div>
        );
      })()}
    </div>
  );
}
