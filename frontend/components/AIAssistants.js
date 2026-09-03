"use client";

import { useRef, useState } from "react";
import { api } from "../lib/api";

const MODES = [
  { key: "traffic", label: "Estratégia de Tráfego", blurb: "Diagnóstico de campanhas, estrutura de contas e otimização — para gestores." },
  { key: "therapy", label: "Nicho Terapia", blurb: "Estratégias de captação para psicólogos e clínicas de terapia." },
];

// Formatos aceitos pro anexo de campanha: exportações do Gerenciador de
// Anúncios (Meta) em CSV ou XLSX, ou um print/screenshot do painel.
const TEXT_EXT = [".csv", ".txt"];
const SHEET_EXT = [".xlsx", ".xls"];
const MAX_TEXT_CHARS = 60_000;

function extOf(name = "") {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    r.readAsText(file);
  });
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",").pop());
    r.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    r.readAsDataURL(file);
  });
}

export default function AIAssistants() {
  const [mode, setMode] = useState("traffic");
  const [threads, setThreads] = useState({ therapy: [], traffic: [] });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState(null); // { name, kind: "text"|"image", text?, dataBase64?, mimeType?, truncated? }
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef(null);

  const messages = threads[mode];

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;
    const ext = extOf(file.name);
    setAttaching(true);
    setError("");
    try {
      if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) {
        let text = await readAsText(file);
        let truncated = false;
        if (text.length > MAX_TEXT_CHARS) {
          text = text.slice(0, MAX_TEXT_CHARS);
          truncated = true;
        }
        setAttachment({ name: file.name, kind: "text", text, truncated });
      } else if (SHEET_EXT.includes(ext)) {
        const dataBase64 = await readAsBase64(file);
        const res = await api("/api/ai/extract-spreadsheet", { method: "POST", body: { fileName: file.name, dataBase64 } });
        setAttachment({ name: file.name, kind: "text", text: res.text, truncated: res.truncated });
      } else if (file.type.startsWith("image/")) {
        const dataBase64 = await readAsBase64(file);
        setAttachment({ name: file.name, kind: "image", dataBase64, mimeType: file.type });
      } else {
        setError("Formato não suportado — envie um CSV, XLSX ou print (imagem) exportado do Gerenciador de Anúncios.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAttaching(false);
    }
  }

  async function send(e) {
    e.preventDefault();
    if ((!input.trim() && !attachment) || sending) return;

    const baseText = input.trim() || (attachment
      ? "Analise esses dados/print da campanha e me diga concretamente o que fazer nas próximas otimizações (o que pausar, escalar, testar ou ajustar)."
      : "");

    let content = baseText;
    let displayText = baseText;
    if (attachment?.kind === "text") {
      content = `${baseText}\n\n[Arquivo de campanha anexado: ${attachment.name}]${attachment.truncated ? " (parcial — arquivo grande, mostrando o início)" : ""}\n${attachment.text}`;
      displayText = `${baseText}\n\n📎 ${attachment.name}`;
    } else if (attachment?.kind === "image") {
      content = [
        { type: "text", text: baseText },
        { type: "image", source: { type: "base64", media_type: attachment.mimeType, data: attachment.dataBase64 } },
      ];
      displayText = `${baseText}\n\n📎 ${attachment.name}`;
    }

    const userMsg = { role: "user", content, displayText };
    const nextMessages = [...messages, userMsg];
    setThreads((t) => ({ ...t, [mode]: nextMessages }));
    setInput("");
    setAttachment(null);
    setSending(true);
    setError("");
    try {
      // A API só precisa de {role, content} — displayText é só pra bolha local.
      const apiMessages = nextMessages.map(({ role, content: c }) => ({ role, content: c }));
      const res = await api("/api/ai/chat", { method: "POST", body: { mode, messages: apiMessages } });
      setThreads((t) => ({ ...t, [mode]: [...t[mode], { role: "assistant", content: res.text, displayText: res.text }] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-4 max-w-3xl">
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${mode === m.key ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-inkfaint">{MODES.find((m) => m.key === mode)?.blurb}</p>
      {mode === "traffic" && (
        <p className="text-[11px] text-inkfaint -mt-2">
          📎 Dica: você pode anexar o arquivo exportado da campanha (CSV/XLSX do Gerenciador de Anúncios) ou um print do painel — a IA analisa e sugere o que otimizar.
        </p>
      )}

      <div className="bg-surface border border-border rounded-xl shadow-sm flex flex-col h-[480px]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-xs text-inkfaint">
              Faça uma pergunta para começar — ex.: &ldquo;minha campanha do cliente X está com CPL alto, o que pode ser?&rdquo;
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i}
              className={`text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-accent text-white" : "bg-surface2 text-ink"}`}>
              {m.displayText ?? (typeof m.content === "string" ? m.content : "📎 anexo")}
            </div>
          ))}
          {sending && <div className="text-xs text-inkfaint">Pensando…</div>}
          {error && (
            <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>
        {attachment && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] bg-accentsoft text-accent px-2.5 py-1 rounded-full">
              📎 {attachment.name}
              <button type="button" onClick={() => setAttachment(null)} className="hover:text-danger font-bold">✕</button>
            </span>
          </div>
        )}
        <form onSubmit={send} className="flex gap-2 p-3 border-t border-border">
          {mode === "traffic" && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls,image/*" className="hidden" onChange={handleFilePicked} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attaching}
                title="Anexar arquivo da campanha (CSV/XLSX/print)"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-border text-inksoft hover:text-accent hover:border-accent transition disabled:opacity-60">
                {attaching ? "…" : "📎"}
              </button>
            </>
          )}
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva sua pergunta…"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <button disabled={sending} className="bg-accent text-white text-sm font-medium px-4 rounded-md hover:bg-accentink disabled:opacity-60">
            Enviar
          </button>
        </form>
      </div>
    </section>
  );
}
