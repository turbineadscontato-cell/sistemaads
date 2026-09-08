"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDate, DOCUMENT_CATEGORY_OPTIONS } from "../../lib/adminFormat";

const MONTH_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function fmtSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function b64ToBlob(b64, mime) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

function emptyForm() {
  return { name: "", category: DOCUMENT_CATEGORY_OPTIONS[0], year: String(CURRENT_YEAR), month: "", notes: "", mimeType: "", dataBase64: "" };
}

export default function AdminDocumentos() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterCategory) qs.set("category", filterCategory);
      if (filterYear) qs.set("year", filterYear);
      setRows(await api(`/api/admin/documentos${qs.toString() ? `?${qs}` : ""}`));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterYear]);

  useEffect(() => { load(); }, [load]);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = String(reader.result).split(",")[1];
      setForm((f) => ({ ...f, mimeType: file.type || "application/octet-stream", dataBase64, name: f.name || file.name }));
    };
    reader.readAsDataURL(file);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Preencha o nome do documento.");
    if (!form.dataBase64) return alert("Selecione um arquivo.");
    setSaving(true);
    try {
      await api("/api/admin/documentos", {
        method: "POST",
        body: {
          name: form.name.trim(), category: form.category, year: Number(form.year) || CURRENT_YEAR,
          month: form.month ? Number(form.month) : null, notes: form.notes || null,
          mimeType: form.mimeType, dataBase64: form.dataBase64,
        },
      });
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function baixar(d) {
    setBusyId(d.id);
    try {
      const full = await api(`/api/admin/documentos/download/${d.id}`);
      const blob = b64ToBlob(full.dataBase64, full.mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = d.name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remover(d) {
    if (!confirm(`Excluir permanentemente "${d.name}"?`)) return;
    setBusyId(d.id);
    try {
      await api(`/api/admin/documentos/${d.id}`, { method: "DELETE" });
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
        <div className="flex flex-wrap gap-2">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
            <option value="">Todas as categorias</option>
            {DOCUMENT_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
            <option value="">Todos os anos</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => { setForm(emptyForm()); setShowForm(true); }} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Enviar documento</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Documento</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Período</th>
                <th className="px-4 py-2.5">Tamanho</th>
                <th className="px-4 py-2.5">Enviado por</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-inkfaint">Nenhum documento cadastrado ainda.</td></tr>)}
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink font-medium">{d.name}{d.notes && <div className="text-[11px] text-inkfaint font-normal">{d.notes}</div>}</td>
                  <td className="px-4 py-2.5 text-inksoft">{d.category}</td>
                  <td className="px-4 py-2.5 text-inksoft mono">{d.year}{d.month ? `/${MONTH_LABEL[d.month - 1]}` : ""}</td>
                  <td className="px-4 py-2.5 text-inksoft mono">{fmtSize(d.size)}</td>
                  <td className="px-4 py-2.5 text-inksoft">{d.createdBy}</td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button disabled={busyId === d.id} onClick={() => baixar(d)} className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">Baixar</button>
                    <button disabled={busyId === d.id} onClick={() => remover(d)} className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Excluir</button>
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
              <h3 className="font-display font-semibold text-ink">Enviar documento</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Arquivo *</label>
                <input required type="file" onChange={onFile}
                  className="w-full mt-1 text-sm text-inksoft file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-ink file:text-[12.5px]" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-3 sm:col-span-1">
                  <label className="text-[11px] uppercase text-inkfaint">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {DOCUMENT_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Ano</label>
                  <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Mês</label>
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="">—</option>
                    {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
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
              <button type="submit" disabled={saving} className="flex-1 text-sm font-semibold py-2.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">{saving ? "Enviando…" : "Enviar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
