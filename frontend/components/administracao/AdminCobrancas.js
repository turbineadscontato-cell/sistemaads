"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { currency, fmtDate } from "../../lib/adminFormat";

const NOTE_TYPE_OPTIONS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "E-mail" },
  { value: "LIGACAO", label: "Ligação" },
  { value: "OUTRO", label: "Outro" },
];

function UrgencyTag({ diasParaVencer, diasAtraso }) {
  if (diasAtraso !== null) {
    return <span className="text-[11px] font-semibold text-danger">{diasAtraso} dia(s) em atraso</span>;
  }
  if (diasParaVencer === 0) return <span className="text-[11px] font-semibold text-warning">Vence hoje</span>;
  if (diasParaVencer !== null) return <span className="text-[11px] text-inkfaint">Vence em {diasParaVencer} dia(s)</span>;
  return null;
}

export default function AdminCobrancas() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [noteType, setNoteType] = useState("WHATSAPP");
  const [noteText, setNoteText] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [postponeId, setPostponeId] = useState(null);
  const [postponeDate, setPostponeDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("/api/admin/cobrancas"));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markPaid(r) {
    setBusyId(r.id);
    try {
      await api(`/api/admin/receitas/${r.id}`, { method: "PATCH", body: { status: "PAGO" } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function addNote(r) {
    if (!noteText.trim()) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/cobrancas/${r.id}/notas`, { method: "POST", body: { type: noteType, note: noteText.trim() } });
      setNoteText("");
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPostpone(r) {
    if (!postponeDate) return;
    setBusyId(r.id);
    try {
      await api(`/api/admin/receitas/${r.id}`, { method: "PATCH", body: { dueDate: postponeDate } });
      setPostponeId(null);
      setPostponeDate("");
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const open = rows.find((r) => r.id === openId);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {loading && <div className="px-4 py-6 text-center text-sm text-inkfaint">Carregando…</div>}
        {!loading && rows.length === 0 && <div className="px-4 py-6 text-center text-sm text-inkfaint">Nenhuma cobrança pendente — tudo em dia.</div>}
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] text-ink font-medium">{r.client?.name || r.description}</div>
                  <div className="text-[11.5px] text-inkfaint truncate">{r.description} · vence {fmtDate(r.dueDate)}</div>
                  <div className="mt-1"><UrgencyTag diasParaVencer={r.diasParaVencer} diasAtraso={r.diasAtraso} /></div>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono text-ink font-semibold">{currency(r.amount)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <button disabled={busyId === r.id} onClick={() => markPaid(r)}
                  className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-successsoft text-success hover:brightness-95 transition disabled:opacity-60">Marcar como pago</button>
                <button onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  className="text-[11.5px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">
                  {r.collectionNotes?.length ? `Histórico (${r.collectionNotes.length})` : "Registrar contato"}
                </button>
                <button onClick={() => { setPostponeId(postponeId === r.id ? null : r.id); setPostponeDate(r.dueDate ? String(r.dueDate).slice(0, 10) : ""); }}
                  className="text-[11.5px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-inksoft hover:text-ink transition">Prorrogar vencimento</button>
              </div>

              {postponeId === r.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="date" value={postponeDate} onChange={(e) => setPostponeDate(e.target.value)}
                    className="bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent" />
                  <button disabled={busyId === r.id} onClick={() => confirmPostpone(r)}
                    className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Confirmar</button>
                </div>
              )}

              {openId === r.id && (
                <div className="mt-3 bg-surface2 border border-border rounded-lg p-3 space-y-2">
                  {(r.collectionNotes || []).length === 0 && <div className="text-[12px] text-inkfaint">Nenhum contato registrado ainda.</div>}
                  {(r.collectionNotes || []).map((n) => (
                    <div key={n.id} className="text-[12px] text-inksoft">
                      <span className="text-inkfaint">{fmtDate(n.createdAt)} · {NOTE_TYPE_OPTIONS.find((o) => o.value === n.type)?.label || n.type}{n.createdBy ? ` · ${n.createdBy}` : ""}:</span> {n.note}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <select value={noteType} onChange={(e) => setNoteType(e.target.value)}
                      className="bg-surface border border-border rounded-lg px-2 py-1.5 text-[12px] text-ink">
                      {NOTE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="ex: cliente informou pagamento pra dia 10"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink placeholder:text-inkfaint focus:outline-none focus:border-accent" />
                    <button disabled={busyId === r.id} onClick={() => addNote(r)}
                      className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">Salvar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
