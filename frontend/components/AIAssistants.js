"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { renderMarkdownLite } from "../lib/markdownLite";

const MODES = [
  { key: "traffic", label: "Estratégia de Tráfego", blurb: "Diagnóstico de campanhas, estrutura de contas e otimização — para gestores." },
  { key: "therapy", label: "Nicho Terapia", blurb: "Estratégias de captação para psicólogos e clínicas de terapia." },
];

// Tamanhos aceitos pela geração de imagem (mesmos valores aceitos pela API
// da OpenAI) — rótulo em português pro seletor.
const IMAGE_SIZES = [
  { key: "1024x1024", label: "Quadrada" },
  { key: "1024x1536", label: "Retrato" },
  { key: "1536x1024", label: "Paisagem" },
];
const MAX_IMAGE_HISTORY = 8;

// Formatos aceitos pro anexo de campanha: exportações do Gerenciador de
// Anúncios (Meta) em CSV ou XLSX, ou um print/screenshot do painel.
const TEXT_EXT = [".csv", ".txt"];
const SHEET_EXT = [".xlsx", ".xls"];
const MAX_TEXT_CHARS = 60_000;

// Efeito de "digitando" — revela o texto aos poucos em vez de aparecer tudo
// de uma vez, pra ficar com a mesma sensação de uma conversa acontecendo
// ao vivo (como aqui no Claude). É um reveal no navegador, não streaming de
// verdade vindo do servidor — a resposta inteira já chegou, só é mostrada
// progressivamente — mas o efeito visual é o que foi pedido, sem precisar
// reescrever toda a infraestrutura de chamada à IA pra streaming real.
const REVEAL_TOTAL_MS = 900; // duração máxima do efeito, não importa o tamanho do texto
const REVEAL_MIN_STEP_MS = 12;

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
  const [view, setView] = useState("chat"); // "chat" | "imagem"
  const [mode, setMode] = useState("traffic");
  const [threads, setThreads] = useState({ therapy: null, traffic: null }); // null = ainda não carregado
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState(null); // { name, kind: "text"|"image", text?, dataBase64?, mimeType?, truncated? }
  const [attaching, setAttaching] = useState(false);
  const [reveal, setReveal] = useState(null); // { mode, full, shown }
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const revealTimer = useRef(null);

  // Geração de imagem (OpenAI) — aba à parte, sem histórico salvo no banco
  // (só na memória da tela), já que são arquivos grandes e cada geração já
  // fica disponível pra baixar na hora.
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgSize, setImgSize] = useState("1024x1024");
  const [imgGenerating, setImgGenerating] = useState(false);
  const [imgError, setImgError] = useState("");
  const [imgResult, setImgResult] = useState(null); // { base64, prompt }
  const [imgHistory, setImgHistory] = useState([]);

  const messages = threads[mode] || [];

  const loadHistory = useCallback(async (m) => {
    try {
      const res = await api(`/api/ai/history?mode=${m}`);
      setThreads((t) => ({ ...t, [m]: res.messages || [] }));
    } catch {
      setThreads((t) => ({ ...t, [m]: [] }));
    }
  }, []);

  useEffect(() => {
    if (threads[mode] === null) loadHistory(mode);
  }, [mode, threads, loadHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, reveal, sending]);

  useEffect(() => () => clearInterval(revealTimer.current), []);

  function startReveal(forMode, fullText) {
    clearInterval(revealTimer.current);
    const len = fullText.length;
    const stepMs = Math.max(REVEAL_MIN_STEP_MS, REVEAL_TOTAL_MS / Math.max(len, 1));
    const chunksNeeded = Math.max(1, Math.ceil(REVEAL_TOTAL_MS / stepMs));
    const step = Math.max(1, Math.ceil(len / chunksNeeded));
    let shown = 0;
    setReveal({ mode: forMode, full: fullText, shown: 0 });
    revealTimer.current = setInterval(() => {
      shown = Math.min(len, shown + step);
      setReveal({ mode: forMode, full: fullText, shown });
      if (shown >= len) {
        clearInterval(revealTimer.current);
        setThreads((t) => ({ ...t, [forMode]: [...(t[forMode] || []), { role: "assistant", displayText: fullText }] }));
        setReveal(null);
      }
    }, stepMs);
  }

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

    const sentMode = mode;
    setThreads((t) => ({ ...t, [sentMode]: [...(t[sentMode] || []), { role: "user", displayText }] }));
    setInput("");
    setAttachment(null);
    setSending(true);
    setError("");
    try {
      const res = await api("/api/ai/chat", { method: "POST", body: { mode: sentMode, message: content, displayText } });
      setSending(false);
      startReveal(sentMode, res.text);
    } catch (err) {
      setSending(false);
      setError(err.message);
    }
  }

  async function clearConversation() {
    if (!confirm("Limpar essa conversa? O histórico salvo desse assistente vai ser apagado.")) return;
    try {
      await api(`/api/ai/history?mode=${mode}`, { method: "DELETE" });
      setThreads((t) => ({ ...t, [mode]: [] }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function generateImage(e) {
    e.preventDefault();
    if (!imgPrompt.trim() || imgGenerating) return;
    setImgGenerating(true);
    setImgError("");
    try {
      const res = await api("/api/ai/generate-image", { method: "POST", body: { prompt: imgPrompt.trim(), size: imgSize } });
      const item = { base64: res.imageBase64, prompt: imgPrompt.trim() };
      setImgResult(item);
      setImgHistory((h) => [item, ...h].slice(0, MAX_IMAGE_HISTORY));
    } catch (err) {
      setImgError(err.message);
    } finally {
      setImgGenerating(false);
    }
  }

  const revealingHere = reveal && reveal.mode === mode;

  return (
    <section className="space-y-4 max-w-3xl">
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        <button onClick={() => setView("chat")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${view === "chat" ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
          Assistentes
        </button>
        <button onClick={() => setView("imagem")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${view === "imagem" ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
          🎨 Gerar imagem
        </button>
      </div>

      {view === "chat" && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
              {MODES.map((m) => (
                <button key={m.key} onClick={() => setMode(m.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${mode === m.key ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            {messages.length > 0 && (
              <button onClick={clearConversation} className="text-[11px] text-inkfaint hover:text-danger transition">
                Limpar conversa
              </button>
            )}
          </div>
          <p className="text-xs text-inkfaint">{MODES.find((m) => m.key === mode)?.blurb}</p>
          {mode === "traffic" && (
            <p className="text-[11px] text-inkfaint -mt-2">
              📎 Dica: você pode anexar o arquivo exportado da campanha (CSV/XLSX do Gerenciador de Anúncios) ou um print do painel — a IA analisa e sugere o que otimizar. Ela também consulta os dados reais de um cliente quando você o menciona pelo nome.
            </p>
          )}

          <div className="bg-surface border border-border rounded-xl shadow-sm flex flex-col h-[520px]">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {threads[mode] === null && (
                <div className="text-xs text-inkfaint">Carregando conversa…</div>
              )}
              {threads[mode] !== null && messages.length === 0 && !revealingHere && (
                <div className="text-xs text-inkfaint">
                  Faça uma pergunta para começar — ex.: &ldquo;como está o cliente X?&rdquo; ou &ldquo;minha campanha do cliente Y está com CPL alto, o que pode ser?&rdquo;
                </div>
              )}
              {messages.map((m, i) => (
                <div key={m.id || i}
                  className={`text-sm rounded-2xl px-3.5 py-2.5 max-w-[85%] leading-relaxed ${m.role === "user" ? "ml-auto bg-accent text-white" : "bg-surface2 text-ink"}`}>
                  {m.role === "user"
                    ? <span className="whitespace-pre-wrap">{m.displayText}</span>
                    : <div className="space-y-1.5">{renderMarkdownLite(m.displayText)}</div>}
                </div>
              ))}
              {revealingHere && (
                <div className="text-sm rounded-2xl px-3.5 py-2.5 max-w-[85%] leading-relaxed bg-surface2 text-ink">
                  <div className="space-y-1.5">{renderMarkdownLite(reveal.full.slice(0, reveal.shown))}</div>
                </div>
              )}
              {sending && !revealingHere && (
                <div className="flex items-center gap-1 px-3.5 py-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce" />
                </div>
              )}
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
              <button disabled={sending || !!revealingHere} className="bg-accent text-white text-sm font-medium px-4 rounded-md hover:bg-accentink disabled:opacity-60">
                Enviar
              </button>
            </form>
          </div>
        </>
      )}

      {view === "imagem" && (
        <div className="space-y-3">
          <p className="text-xs text-inkfaint">
            Gere imagens com IA a partir de uma descrição — útil para criativos de anúncio, capas e artes rápidas. Cada imagem gerada tem custo na conta OpenAI configurada pelo sócio.
          </p>
          <form onSubmit={generateImage} className="bg-surface border border-border rounded-xl shadow-sm p-3 space-y-2.5">
            <textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} rows={3}
              placeholder="Descreva a imagem que você quer gerar — ex.: &quot;anúncio para Instagram, mulher sorrindo em sessão de terapia, tons acolhedores, espaço para texto à esquerda&quot;"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink resize-y" />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-surface2 border border-border rounded-lg p-1 w-fit">
                {IMAGE_SIZES.map((s) => (
                  <button key={s.key} type="button" onClick={() => setImgSize(s.key)}
                    className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition ${imgSize === s.key ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button disabled={imgGenerating || !imgPrompt.trim()} className="bg-accent text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
                {imgGenerating ? "Gerando… (pode levar até 30s)" : "Gerar imagem"}
              </button>
            </div>
          </form>

          {imgError && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{imgError}</div>}

          {imgResult && (
            <div className="bg-surface border border-border rounded-xl shadow-sm p-4 space-y-3">
              <img src={`data:image/png;base64,${imgResult.base64}`} alt={imgResult.prompt} className="w-full rounded-lg border border-border" />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11.5px] text-inkfaint truncate">{imgResult.prompt}</p>
                <a href={`data:image/png;base64,${imgResult.base64}`} download="imagem-turbineads.png"
                  className="shrink-0 text-xs font-medium bg-surface2 border border-border text-inksoft hover:text-ink px-3 py-1.5 rounded-md transition">
                  Baixar imagem
                </a>
              </div>
            </div>
          )}

          {imgHistory.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-inkfaint">Geradas nessa sessão</p>
              <div className="flex gap-2 flex-wrap">
                {imgHistory.map((item, i) => (
                  <button key={i} type="button" onClick={() => setImgResult(item)}
                    className={`w-16 h-16 rounded-md overflow-hidden border-2 transition ${imgResult === item ? "border-accent" : "border-border"}`}>
                    <img src={`data:image/png;base64,${item.base64}`} alt={item.prompt} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
