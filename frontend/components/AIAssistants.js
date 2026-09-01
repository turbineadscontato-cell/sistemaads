"use client";

import { useState } from "react";
import { api } from "../lib/api";

const MODES = [
  { key: "traffic", label: "Estratégia de Tráfego", blurb: "Diagnóstico de campanhas, estrutura de contas e otimização — para gestores." },
  { key: "therapy", label: "Nicho Terapia", blurb: "Estratégias de captação para psicólogos e clínicas de terapia." },
];

export default function AIAssistants() {
  const [mode, setMode] = useState("traffic");
  const [threads, setThreads] = useState({ therapy: [], traffic: [] });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messages = threads[mode];

  async function send(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const userMsg = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMsg];
    setThreads((t) => ({ ...t, [mode]: nextMessages }));
    setInput("");
    setSending(true);
    setError("");
    try {
      const res = await api("/api/ai/chat", { method: "POST", body: { mode, messages: nextMessages } });
      setThreads((t) => ({ ...t, [mode]: [...t[mode], { role: "assistant", content: res.text }] }));
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
              {m.content}
            </div>
          ))}
          {sending && <div className="text-xs text-inkfaint">Pensando…</div>}
          {error && (
            <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>
        <form onSubmit={send} className="flex gap-2 p-3 border-t border-border">
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
