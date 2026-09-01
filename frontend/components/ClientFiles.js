"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

const CATEGORY_LABEL = { FOTO: "Foto", SCRIPT: "Script", OUTRO: "Outro" };

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

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Files are stored inline as base64 in Postgres (no S3/Cloudinary needed —
// keeps this working on Railway's ephemeral filesystem). canManage = staff
// (sócio, or the assigned gestor) who can upload scripts/docs and delete;
// clients can always view, and can upload their own photos when allowUpload.
export default function ClientFiles({ clientId, canManage, allowClientUpload = true, showScriptGenerator = false }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("SCRIPT");

  const [scriptTone, setScriptTone] = useState("consultivo e confiante");
  const [scriptText, setScriptText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [scriptError, setScriptError] = useState("");

  const load = useCallback(async () => {
    try {
      setFiles(await api(`/api/files/${clientId}`));
    } catch (err) {
      // silent — panel just stays empty
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(",")[1];
        await api(`/api/files/${clientId}`, {
          method: "POST",
          body: { name: file.name, mimeType: file.type || "application/octet-stream", dataBase64: base64, category },
        });
        load();
      } catch (err) {
        alert(err.message);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  async function view(f) {
    try {
      const full = await api(`/api/files/download/${f.id}`);
      const blob = b64ToBlob(full.dataBase64, full.mimeType);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(f) {
    if (!confirm(`Remover "${f.name}"?`)) return;
    try {
      await api(`/api/files/${f.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function generateScript() {
    setGenerating(true);
    setScriptError("");
    setScriptText("");
    try {
      const res = await api("/api/ai/script", { method: "POST", body: { clientId, tone: scriptTone } });
      setScriptText(res.text);
    } catch (err) {
      setScriptError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveScriptAsFile() {
    if (!scriptText.trim()) return;
    try {
      await api(`/api/files/${clientId}`, {
        method: "POST",
        body: {
          name: `script-ia-${new Date().toISOString().slice(0, 10)}.txt`,
          mimeType: "text/plain",
          dataBase64: utf8ToBase64(scriptText),
          category: "SCRIPT",
        },
      });
      load();
      alert("Script salvo nos arquivos do cliente.");
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border font-display font-semibold text-sm text-ink">Arquivos do cliente</div>

      {(canManage || allowClientUpload) && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          {canManage && (
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink">
              <option value="SCRIPT">Script de vendas</option>
              <option value="FOTO">Foto</option>
              <option value="OUTRO">Outro</option>
            </select>
          )}
          <label className="text-xs bg-accent text-white font-medium px-3 py-1.5 rounded-md hover:bg-accentink cursor-pointer transition">
            {uploading ? "Enviando…" : canManage ? "Enviar arquivo" : "Enviar foto"}
            <input type="file" className="hidden" onChange={handleFilePick} disabled={uploading} />
          </label>
          <span className="text-[10.5px] text-inkfaint">limite ~6MB por arquivo</span>
        </div>
      )}

      <div className="divide-y divide-border max-h-64 overflow-y-auto">
        {files.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="text-ink truncate">{f.name}</div>
              <div className="text-[10.5px] text-inkfaint">{CATEGORY_LABEL[f.category] || f.category} · {fmtSize(f.size)}</div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button onClick={() => view(f)} className="text-[11px] text-accent hover:underline">ver</button>
              {canManage && <button onClick={() => remove(f)} className="text-[11px] text-danger hover:underline">remover</button>}
            </div>
          </div>
        ))}
        {files.length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Nenhum arquivo ainda.</div>}
      </div>

      {showScriptGenerator && (
        <div className="border-t border-border p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-inkfaint">Gerador de script com IA</div>
          <div className="flex gap-2">
            <input value={scriptTone} onChange={(e) => setScriptTone(e.target.value)} placeholder="Tom (ex: consultivo e confiante)"
              className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border bg-surface2 text-ink" />
            <button onClick={generateScript} disabled={generating}
              className="bg-accent text-white text-xs font-medium px-3 rounded-md hover:bg-accentink disabled:opacity-60">
              {generating ? "Gerando…" : "Gerar"}
            </button>
          </div>
          {scriptError && <div className="text-[11px] text-danger">{scriptError}</div>}
          {scriptText && (
            <div className="space-y-2">
              <textarea value={scriptText} onChange={(e) => setScriptText(e.target.value)} rows={8}
                className="w-full px-2.5 py-2 text-xs rounded-md border border-border bg-surface2 text-ink resize-y" />
              <button onClick={saveScriptAsFile} className="text-[11px] text-accent hover:underline">Salvar como arquivo do cliente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
