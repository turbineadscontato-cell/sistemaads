"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate, CONTRACT_TYPE_OPTIONS, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_CLASS } from "../../lib/adminFormat";

const MAX_FILE_BYTES = 5_500_000;
const TYPE_FILTERS = [{ value: "", label: "Todos os tipos" }, ...CONTRACT_TYPE_OPTIONS];
const STATUS_FILTERS = ["", "ATIVO", "ENCERRADO", "CANCELADO"];

function emptyForm() {
  return {
    type: "CLIENTE",
    title: "",
    counterpartyName: "",
    clientId: "",
    employeeId: "",
    supplierId: "",
    startDate: "",
    endDate: "",
    value: "",
    renewalAlertDays: "30",
    notes: "",
    fileName: "",
    fileMimeType: "",
    fileBase64: "",
  };
}

function StatusPill({ status }) {
  return <span className={`inline-flex text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${CONTRACT_STATUS_CLASS[status] || "bg-white/5 text-inksoft"}`}>{CONTRACT_STATUS_LABEL[status] || status}</span>;
}

function Renewal({ diasParaVencer, diasAtraso, alertaRenovacao }) {
  if (diasAtraso !== null) return <span className="text-[11px] font-semibold text-danger">venceu há {diasAtraso} dia(s)</span>;
  if (diasParaVencer !== null && alertaRenovacao) return <span className="text-[11px] font-semibold text-warning">renova em {diasParaVencer} dia(s)</span>;
  if (diasParaVencer !== null) return <span className="text-[11px] text-inkfaint">renova em {diasParaVencer} dia(s)</span>;
  return <span className="text-[11px] text-inkfaint">sem vencimento</span>;
}

export default function AdminContratos() {
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [fileError, setFileError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, e, s] = await Promise.all([
        api("/api/admin/contratos"),
        api("/api/clients"),
        api("/api/admin/equipe"),
        api("/api/admin/fornecedores"),
      ]);
      setRows(r);
      setClients(c);
      setEmployees(e.filter((x) => x.status === "ATIVO"));
      setSuppliers(s.filter((x) => x.status === "ATIVO"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows
    .filter((r) => !typeFilter || r.type === typeFilter)
    .filter((r) => !statusFilter || r.status === statusFilter), [rows, typeFilter, statusFilter]);

  const alertas = useMemo(() => rows.filter((r) => r.alertaRenovacao || r.diasAtraso !== null), [rows]);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (file.size > MAX_FILE_BYTES) {
      setFileError("Arquivo muito grande (máximo ~5MB).");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, fileName: file.name, fileMimeType: file.type, fileBase64: reader.result }));
    reader.readAsDataURL(file);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return alert("Preencha o título do contrato.");
    setSaving(true);
    try {
      await api("/api/admin/contratos", {
        method: "POST",
        body: {
          type: form.type,
          title: form.title.trim(),
          counterpartyName: form.counterpartyName || null,
          clientId: form.type === "CLIENTE" ? form.clientId || null : null,
          employeeId: form.type === "FUNCIONARIO" || form.type === "PRESTADOR" ? form.employeeId || null : null,
          supplierId: form.type === "FORNECEDOR" ? form.supplierId || null : null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          value: form.value ? Number(form.value) : null,
          renewalAlertDays: Number(form.renewalAlertDays) || 30,
          notes: form.notes || null,
          fileName: form.fileName || null,
          fileMimeType: form.fileMimeType || null,
          fileBase64: form.fileBase64 || null,
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

  async function encerrar(r) {
    if (!confirm(`Marcar o contrato "${r.title}" como encerrado?`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/contratos/${r.id}`, { method: "PATCH", body: { status: "ENCERRADO" } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelar(r) {
    if (!confirm(`Cancelar o contrato "${r.title}"? Fica marcado como cancelado, sem apagar o histórico.`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/contratos/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {alertas.length > 0 && (
        <div className="bg-warningsoft border border-warning/30 rounded-xl px-4 py-2.5 text-[12.5px] text-warning">
          {alertas.length} contrato(s) vencendo em breve ou já vencido(s) — veja a coluna "Renovação".
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {TYPE_FILTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s ? (CONTRACT_STATUS_LABEL[s] || s) : "Todos os status"}</option>)}
        </select>
        <button onClick={() => { setForm(emptyForm()); setFileError(""); setShowForm(true); }}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition">+ Novo contrato</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Contraparte</th>
                <th className="px-4 py-2.5">Vencimento</th>
                <th className="px-4 py-2.5">Renovação</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={8} className="px-4 py-6 text-center text-inkfaint">Carregando…</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td colSpan={8} className="px-4 py-6 text-center text-inkfaint">Nenhum contrato cadastrado ainda.</td></tr>)}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-ink">{r.title}{r.hasFile && <span className="ml-1.5 text-[10px] text-inkfaint">📎</span>}</td>
                  <td className="px-4 py-2.5 text-inksoft">{CONTRACT_TYPE_OPTIONS.find((t) => t.value === r.type)?.label || r.type}</td>
                  <td className="px-4 py-2.5 text-inksoft">{r.client?.name || r.employee?.name || r.supplier?.name || r.counterpartyName || "—"}</td>
                  <td className="px-4 py-2.5 mono text-inksoft">{fmtDate(r.endDate)}</td>
                  <td className="px-4 py-2.5"><Renewal diasParaVencer={r.diasParaVencer} diasAtraso={r.diasAtraso} alertaRenovacao={r.alertaRenovacao} /></td>
                  <td className="px-4 py-2.5 mono text-ink">{r.value ? currency(r.value) : "—"}</td>
                  <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.status === "ATIVO" && (
                        <button disabled={busyId === r.id} onClick={() => encerrar(r)}
                          className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition disabled:opacity-60">Encerrar</button>
                      )}
                      {r.status !== "CANCELADO" && (
                        <button disabled={busyId === r.id} onClick={() => cancelar(r)}
                          className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-dangersoft text-danger hover:brightness-95 transition disabled:opacity-60">Cancelar</button>
                      )}
                    </div>
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
              <h3 className="font-display font-semibold text-ink">Novo contrato</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Tipo *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, clientId: "", employeeId: "", supplierId: "" })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                  {CONTRACT_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Título *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex: Contrato de tráfego pago — Cliente X"
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>

              {form.type === "CLIENTE" && (
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Cliente</label>
                  <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="">Nenhum — só contraparte livre abaixo</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {(form.type === "FUNCIONARIO" || form.type === "PRESTADOR") && (
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Membro da equipe</label>
                  <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="">Nenhum — só contraparte livre abaixo</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
              )}
              {form.type === "FORNECEDOR" && (
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Fornecedor</label>
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink">
                    <option value="">Nenhum — só contraparte livre abaixo</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Contraparte (nome livre, se não estiver na lista acima)</label>
                <input value={form.counterpartyName} onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
                  className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Início</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Vencimento/renovação</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Valor (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-inkfaint">Alertar quantos dias antes de vencer</label>
                  <input type="number" min="1" value={form.renewalAlertDays} onChange={(e) => setForm({ ...form, renewalAlertDays: e.target.value })}
                    className="w-full mt-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mono focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase text-inkfaint">Anexar contrato (PDF/imagem, opcional)</label>
                <input type="file" accept="image/*,application/pdf" onChange={onFile}
                  className="w-full mt-1 text-[12.5px] text-inksoft file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-ink" />
                {form.fileName && <div className="text-[11px] text-inkfaint mt-1">Anexado: {form.fileName}</div>}
                {fileError && <div className="text-[11px] text-danger mt-1">{fileError}</div>}
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
