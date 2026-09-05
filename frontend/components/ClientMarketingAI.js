"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { renderMarkdownLite } from "../lib/markdownLite";

const REVEAL_TOTAL_MS = 900;
const REVEAL_MIN_STEP_MS = 12;

const TABS = [
  { key: "chat", label: "Assistente de Marketing" },
  { key: "instagram", label: "Análise de Instagram" },
];

const MAX_IMAGES = 3;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Client-facing "do everything a digital marketing AI can do" tab: a free
// chat for scripts/strategies, plus a guided Instagram-profile analysis that
// suggests what to improve and which service package fits the client's
// current market position + Instagram maturity + sales authority.
export default function ClientMarketingAI() {
  const [tab, setTab] = useState("chat");

  // Chat state
  const [messages, setMessages] = useState(null); // null = ainda não carregado do histórico salvo
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [reveal, setReveal] = useState(null); // { full, shown } — efeito de "digitando" ao mostrar a resposta
  const scrollRef = useRef(null);
  const revealTimer = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api("/api/ai/history?mode=client_marketing");
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, reveal, sending]);

  useEffect(() => () => clearInterval(revealTimer.current), []);

  function startReveal(fullText) {
    clearInterval(revealTimer.current);
    const len = fullText.length;
    const stepMs = Math.max(REVEAL_MIN_STEP_MS, REVEAL_TOTAL_MS / Math.max(len, 1));
    const chunksNeeded = Math.max(1, Math.ceil(REVEAL_TOTAL_MS / stepMs));
    const step = Math.max(1, Math.ceil(len / chunksNeeded));
    let shown = 0;
    setReveal({ full: fullText, shown: 0 });
    revealTimer.current = setInterval(() => {
      shown = Math.min(len, shown + step);
      setReveal({ full: fullText, shown });
      if (shown >= len) {
        clearInterval(revealTimer.current);
        setMessages((m) => [...(m || []), { role: "assistant", displayText: fullText }]);
        setReveal(null);
      }
    }, stepMs);
  }

  async function clearConversation() {
    if (!confirm("Limpar essa conversa? O histórico salvo vai ser apagado.")) return;
    try {
      await api("/api/ai/history?mode=client_marketing", { method: "DELETE" });
      setMessages([]);
    } catch (err) {
      setChatError(err.message);
    }
  }

  // Instagram analysis state
  const [igForm, setIgForm] = useState({ handle: "", followers: "", bio: "", niche: "", approach: "", extraNotes: "" });
  const [images, setImages] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [igError, setIgError] = useState("");
  const [igResult, setIgResult] = useState("");

  async function send(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setMessages((m) => [...(m || []), { role: "user", displayText: text }]);
    setInput("");
    setSending(true);
    setChatError("");
    try {
      const res = await api("/api/ai/chat", { method: "POST", body: { mode: "client_marketing", message: text, displayText: text } });
      setSending(false);
      startReveal(res.text);
    } catch (err) {
      setSending(false);
      setChatError(err.message);
    }
  }

  async function handleImagePick(e) {
    const files = Array.from(e.target.files || []).slice(0, MAX_IMAGES - images.length);
    for (const file of files) {
      try {
        const dataBase64 = await readFileAsBase64(file);
        setImages((imgs) => [...imgs, { name: file.name, mimeType: file.type || "image/png", dataBase64 }]);
      } catch (err) {
        // silent
      }
    }
    e.target.value = "";
  }

  function removeImage(i) {
    setImages((imgs) => imgs.filter((_, idx) => idx !== i));
  }

  async function analyze(e) {
    e.preventDefault();
    setAnalyzing(true);
    setIgError("");
    setIgResult("");
    try {
      const res = await api("/api/ai/instagram-analysis", {
        method: "POST",
        body: { ...igForm, images: images.map(({ mimeType, dataBase64 }) => ({ mimeType, dataBase64 })) },
      });
      setIgResult(res.text);
    } catch (err) {
      setIgError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${tab === t.key ? "bg-accent text-white" : "text-inksoft hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "chat" && (
        <div className="max-w-3xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-inkfaint">
              Peça scripts de vendas, ideias de conteúdo, estratégias de marketing, ajuda com posicionamento e preço, ou qualquer dúvida de marketing digital.
            </p>
            {messages?.length > 0 && (
              <button onClick={clearConversation} className="text-[11px] text-inkfaint hover:text-danger transition shrink-0">
                Limpar conversa
              </button>
            )}
          </div>
          <div className="bg-surface border border-border rounded-xl shadow-sm flex flex-col h-[480px]">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages === null && <div className="text-xs text-inkfaint">Carregando conversa…</div>}
              {messages?.length === 0 && !reveal && (
                <div className="text-xs text-inkfaint">
                  Ex.: &ldquo;me dá um script de WhatsApp para responder quem chegou pelo anúncio&rdquo; ou &ldquo;quais conteúdos eu posso postar essa semana?&rdquo;
                </div>
              )}
              {messages?.map((m, i) => (
                <div key={m.id || i}
                  className={`text-sm rounded-2xl px-3.5 py-2.5 max-w-[85%] leading-relaxed ${m.role === "user" ? "ml-auto bg-accent text-white" : "bg-surface2 text-ink"}`}>
                  {m.role === "user"
                    ? <span className="whitespace-pre-wrap">{m.displayText}</span>
                    : <div className="space-y-1.5">{renderMarkdownLite(m.displayText)}</div>}
                </div>
              ))}
              {reveal && (
                <div className="text-sm rounded-2xl px-3.5 py-2.5 max-w-[85%] leading-relaxed bg-surface2 text-ink">
                  <div className="space-y-1.5">{renderMarkdownLite(reveal.full.slice(0, reveal.shown))}</div>
                </div>
              )}
              {sending && !reveal && (
                <div className="flex items-center gap-1 px-3.5 py-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce" />
                </div>
              )}
              {chatError && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{chatError}</div>}
            </div>
            <form onSubmit={send} className="flex gap-2 p-3 border-t border-border">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva sua pergunta…"
                className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink" />
              <button disabled={sending || !!reveal} className="bg-accent text-white text-sm font-medium px-4 rounded-md hover:bg-accentink disabled:opacity-60">
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === "instagram" && (
        <div className="max-w-3xl space-y-3">
          <p className="text-xs text-inkfaint">
            Conte sobre o seu Instagram (ou envie prints) e a IA analisa o que pode melhorar e sugere um pacote de acordo com sua autoridade e maturidade no Instagram.
          </p>
          <form onSubmit={analyze} className="bg-surface border border-border rounded-xl shadow-sm p-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input placeholder="@ do Instagram" value={igForm.handle} onChange={(e) => setIgForm({ ...igForm, handle: e.target.value })}
                className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
              <input type="number" placeholder="Nº de seguidores (aprox.)" value={igForm.followers} onChange={(e) => setIgForm({ ...igForm, followers: e.target.value })}
                className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input placeholder="Nicho/especialidade" value={igForm.niche} onChange={(e) => setIgForm({ ...igForm, niche: e.target.value })}
                className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
              <input placeholder="Sua abordagem/diferencial" value={igForm.approach} onChange={(e) => setIgForm({ ...igForm, approach: e.target.value })}
                className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
            </div>
            <textarea placeholder="Cole sua bio atual (opcional)" rows={2} value={igForm.bio} onChange={(e) => setIgForm({ ...igForm, bio: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink resize-y" />
            <textarea placeholder="Observações extras (opcional)" rows={2} value={igForm.extraNotes} onChange={(e) => setIgForm({ ...igForm, extraNotes: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink resize-y" />

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {images.map((img, i) => (
                  <span key={i} className="text-[10.5px] bg-surface2 border border-border rounded-md px-2 py-1 flex items-center gap-1.5">
                    {img.name}
                    <button type="button" onClick={() => removeImage(i)} className="text-danger hover:underline">×</button>
                  </span>
                ))}
                {images.length < MAX_IMAGES && (
                  <label className="text-[11px] bg-surface2 border border-border text-inksoft font-medium px-2.5 py-1.5 rounded-md hover:text-ink cursor-pointer transition">
                    + Anexar print do perfil
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
                  </label>
                )}
              </div>
              <span className="text-[10.5px] text-inkfaint">até {MAX_IMAGES} imagens, ~4MB cada</span>
            </div>

            <button disabled={analyzing} className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
              {analyzing ? "Analisando…" : "Analisar meu Instagram"}
            </button>
          </form>

          {igError && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{igError}</div>}
          {igResult && (
            <div className="bg-surface border border-border rounded-xl shadow-sm p-4 text-sm text-ink whitespace-pre-wrap leading-relaxed">
              {igResult}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
