"use client";

import { useState } from "react";
import { api, apiDownload } from "../../lib/api";
import { currency } from "../../lib/adminFormat";

const PERIOD_OPTIONS = [
  { value: "mes", label: "Mês atual" },
  { value: "trimestre", label: "Últimos 3 meses" },
  { value: "semestre", label: "Últimos 6 meses" },
  { value: "ano", label: "Últimos 12 meses" },
];

function printHtml(title, bodyHtml) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return alert("Permita pop-ups pra imprimir/exportar em PDF.");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:32px;}
      h1{font-size:18px;margin:0 0 4px;} .sub{color:#666;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;font-size:13px;} th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;}
      th{text-transform:uppercase;font-size:10px;color:#666;} .total{font-weight:bold;border-top:2px solid #111;}
    </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export default function AdminRelatorios() {
  const [preset, setPreset] = useState("mes");
  const [busy, setBusy] = useState("");

  async function baixar(type, format) {
    setBusy(`${type}-${format}`);
    try {
      await apiDownload(`/api/admin/relatorios/export?type=${type}&format=${format}`, `${type}.${format}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy("");
    }
  }

  async function baixarDRE(format) {
    setBusy(`dre-${format}`);
    try {
      await apiDownload(`/api/admin/relatorios/dre-export?preset=${preset}&format=${format}`, `dre.${format}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy("");
    }
  }

  async function imprimirDRE() {
    setBusy("dre-pdf");
    try {
      const data = await api(`/api/admin/dre?preset=${preset}`);
      const rows = (label, list) => list.map((r) => `<tr><td>${r.category}</td><td style="text-align:right">${currency(r.amount)}</td></tr>`).join("");
      const html = `
        <h1>DRE gerencial — TurbinaADS</h1>
        <div class="sub">Período: ${PERIOD_OPTIONS.find((p) => p.value === preset)?.label}</div>
        <table>
          <tr><th>Receita bruta</th><th style="text-align:right">${currency(data.receitaBruta)}</th></tr>
          ${rows("receita", data.receitaPorCategoria)}
          <tr><th>Despesas totais</th><th style="text-align:right">${currency(data.totalDespesas)}</th></tr>
          ${rows("despesa", data.despesaPorCategoria)}
          <tr class="total"><td>Resultado líquido</td><td style="text-align:right">${currency(data.resultadoLiquido)}</td></tr>
        </table>`;
      printHtml("DRE gerencial", html);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-sm text-ink">Relatórios exportáveis</h3>
        <select value={preset} onChange={(e) => setPreset(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
          <div className="text-[13px] font-semibold text-ink">Receitas</div>
          <div className="flex gap-2">
            <button disabled={busy === "receitas-csv"} onClick={() => baixar("receitas", "csv")} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">CSV</button>
            <button disabled={busy === "receitas-xlsx"} onClick={() => baixar("receitas", "xlsx")} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">Excel</button>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
          <div className="text-[13px] font-semibold text-ink">Despesas</div>
          <div className="flex gap-2">
            <button disabled={busy === "despesas-csv"} onClick={() => baixar("despesas", "csv")} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">CSV</button>
            <button disabled={busy === "despesas-xlsx"} onClick={() => baixar("despesas", "xlsx")} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">Excel</button>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
          <div className="text-[13px] font-semibold text-ink">DRE ({PERIOD_OPTIONS.find((p) => p.value === preset)?.label})</div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy === "dre-csv"} onClick={() => baixarDRE("csv")} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">CSV</button>
            <button disabled={busy === "dre-xlsx"} onClick={() => baixarDRE("xlsx")} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">Excel</button>
            <button disabled={busy === "dre-pdf"} onClick={imprimirDRE} className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Imprimir/PDF</button>
          </div>
        </div>
      </div>

      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        CSV e Excel baixam direto; "Imprimir/PDF" abre uma janela com o DRE formatado e chama a impressão do navegador — escolha "Salvar como PDF" no destino da impressão.
      </div>
    </div>
  );
}
