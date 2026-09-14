"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

// Construtor de sites com IA — chat + prévia ao vivo, uso interno (sócio/
// gestor). Cada "projeto" guarda a conversa inteira; a prévia sempre mostra
// o HTML mais recente que a IA gerou (currentHtml, vindo do backend). Não
// usa streaming de verdade — a resposta inteira chega de uma vez, o que pode
// levar alguns segundos numa página grande (por isso o aviso no botão).

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const MAX_DIM = 1600; // fotos de site precisam de mais resolução que um avatar
const MAX_IMAGES = 4; // limite por mensagem — mantém o total dentro do limite de tamanho do backend

// Redimensiona a foto no navegador antes de anexar — mesmo princípio já
// usado em AvatarButton.js/AIAssistants.js (canvas + toDataURL), só que com
// um tamanho máximo maior porque essas fotos viram imagem de destaque no
// site (hero, seção "sobre" etc), não um avatar pequeno.
function resizeSitePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_DIM) {
          height = Math.round(height * (MAX_DIM / width));
          width = MAX_DIM;
        } else if (height >= width && height > MAX_DIM) {
          width = Math.round(width * (MAX_DIM / height));
          height = MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve({ dataUrl, dataBase64: dataUrl.split(",").pop(), mimeType: "image/jpeg" });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function downloadHtml(html, name) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(name || "site").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function NewProjectForm({ clients, onCreated }) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const project = await api("/api/ai-sites", { method: "POST", body: { name: name.trim(), clientId: clientId || undefined } });
      setName("");
      setClientId("");
      onCreated(project);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-xl shadow-sm p-3 space-y-2.5">
      <p className="text-xs font-medium text-ink">Novo projeto de site</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do projeto (ex: Site Dra. Ana)"
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink" />
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink sm:w-56">
          <option value="">Sem cliente vinculado</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button disabled={creating || !name.trim()} className="shrink-0 bg-accent text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60">
          {creating ? "Criando…" : "Criar"}
        </button>
      </div>
      {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
    </form>
  );
}

function ProjectChat({ projectId, onBack }) {
  const [data, setData] = useState(null); // { project, messages, currentHtml }
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [previewTab, setPreviewTab] = useState("preview"); // "preview" | "chat" (mobile toggle)
  const [pendingImages, setPendingImages] = useState([]); // [{ name, mimeType, dataBase64, dataUrl }]
  const [attaching, setAttaching] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/ai-sites/${projectId}`));
    } catch (err) {
      setError(err.message);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [data, sending]);

  async function handlePhotosPicked(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (pendingImages.length + files.length > MAX_IMAGES) {
      setError(`No máximo ${MAX_IMAGES} fotos por mensagem.`);
      return;
    }
    setAttaching(true);
    setError("");
    try {
      const resized = await Promise.all(
        files.map(async (file) => {
          if (!file.type.startsWith("image/")) throw new Error("Selecione apenas arquivos de imagem.");
          const { dataUrl, dataBase64, mimeType } = await resizeSitePhoto(file);
          return { name: file.name, mimeType, dataBase64, dataUrl };
        })
      );
      setPendingImages((p) => [...p, ...resized]);
    } catch (err) {
      setError(err.message || "Não foi possível anexar essa foto.");
    } finally {
      setAttaching(false);
    }
  }

  function removePendingImage(idx) {
    setPendingImages((p) => p.filter((_, i) => i !== idx));
  }

  async function send(e) {
    e.preventDefault();
    if ((!input.trim() && !pendingImages.length) || sending || !data) return;
    const text = input.trim() || "Veja as fotos anexadas e sugira como usá-las no site.";
    const images = pendingImages;
    setInput("");
    setPendingImages([]);
    setSending(true);
    setError("");
    const displayText = images.length ? `${text}\n\n📎 ${images.length} foto${images.length > 1 ? "s" : ""} anexada${images.length > 1 ? "s" : ""}` : text;
    setData((d) => ({ ...d, messages: [...d.messages, { id: `tmp-${Date.now()}`, role: "user", text: displayText, hasHtml: false }] }));
    try {
      const res = await api(`/api/ai-sites/${projectId}/messages`, {
        method: "POST",
        body: { message: text, images: images.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 })) },
      });
      setData((d) => ({
        ...d,
        messages: [...d.messages, { id: `tmp-a-${Date.now()}`, role: "assistant", text: res.text, hasHtml: !!res.htmlSnapshot }],
        currentHtml: res.htmlSnapshot || d.currentHtml,
      }));
      if (res.htmlSnapshot) setPreviewTab("preview");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {error
          ? <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>
          : <div className="text-xs text-inkfaint">Carregando projeto…</div>}
        <button onClick={onBack} className="text-xs text-inkfaint hover:text-ink">← voltar</button>
      </div>
    );
  }

  const chatPane = (
    <div className="bg-surface border border-border rounded-xl shadow-sm flex flex-col h-[520px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {data.messages.length === 0 && (
          <div className="text-xs text-inkfaint">
            Descreva o site que você quer — ex.: &ldquo;landing page pra psicóloga infantil, tom acolhedor, cores em azul claro e branco, com seção de agendamento no WhatsApp&rdquo;. Já pode anexar fotos (📎) junto com o pedido — a IA usa elas de verdade na página, não fica só no texto.
          </div>
        )}
        {data.messages.map((m) => (
          <div key={m.id} className={`text-sm rounded-2xl px-3.5 py-2.5 max-w-[92%] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-accent text-white" : "bg-surface2 text-ink"}`}>
            {m.text}
            {m.role === "user" && !!m.imageCount && <div className="mt-1 text-[10.5px] opacity-80">📎 {m.imageCount} foto{m.imageCount > 1 ? "s" : ""} anexada{m.imageCount > 1 ? "s" : ""}</div>}
            {m.role === "assistant" && m.hasHtml && <div className="mt-1 text-[10.5px] opacity-70">🌐 site atualizado</div>}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-1 px-3.5 py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-inkfaint animate-bounce" />
          </div>
        )}
        {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
      </div>
      {pendingImages.length > 0 && (
        <div className="flex gap-2 flex-wrap px-3 pt-2.5 border-t border-border">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative w-12 h-12 rounded-md overflow-hidden border border-border shrink-0">
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
              <button type="button" onClick={() => removePendingImage(i)} title="Remover"
                className="absolute top-0 right-0 w-4 h-4 bg-black/70 text-white text-[10px] flex items-center justify-center leading-none rounded-bl-md hover:bg-danger">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={send} className={`flex gap-2 p-3 ${pendingImages.length ? "pt-2" : "border-t border-border"}`}>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attaching || pendingImages.length >= MAX_IMAGES}
          title="Anexar fotos" aria-label="Anexar fotos"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-border bg-surface2 text-inksoft hover:text-accent hover:border-accent/50 transition disabled:opacity-50">
          {attaching ? "…" : "📎"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotosPicked} />
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Descreva o que você quer no site…"
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink" />
        <button disabled={sending || (!input.trim() && !pendingImages.length)} className="bg-accent text-white text-sm font-medium px-4 rounded-md hover:bg-accentink disabled:opacity-60">
          {sending ? "Gerando…" : "Enviar"}
        </button>
      </form>
    </div>
  );

  const previewPane = (
    <div className="bg-surface border border-border rounded-xl shadow-sm h-[520px] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-inkfaint">Prévia ao vivo</span>
        {data.currentHtml && (
          <div className="flex gap-1.5">
            <button onClick={() => downloadHtml(data.currentHtml, data.project.name)}
              className="text-[11px] font-medium bg-surface2 border border-border text-inksoft hover:text-ink px-2.5 py-1 rounded-md transition">
              Baixar HTML
            </button>
          </div>
        )}
      </div>
      {data.currentHtml
        ? <iframe title="Prévia do site" srcDoc={data.currentHtml} sandbox="allow-scripts" className="flex-1 w-full bg-white" />
        : <div className="flex-1 flex items-center justify-center text-xs text-inkfaint p-6 text-center">Ainda não há um site gerado nesse projeto — descreva o que você quer no chat.</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <button onClick={onBack} className="text-xs text-inkfaint hover:text-ink">← voltar</button>
          <div className="font-display font-semibold text-sm text-ink mt-0.5">
            {data.project.name}{data.project.clientId ? "" : ""}
          </div>
        </div>
        <div className="sm:hidden flex gap-1 bg-surface border border-border rounded-lg p-1">
          <button onClick={() => setPreviewTab("chat")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${previewTab === "chat" ? "bg-accent text-white" : "text-inksoft"}`}>Chat</button>
          <button onClick={() => setPreviewTab("preview")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${previewTab === "preview" ? "bg-accent text-white" : "text-inksoft"}`}>Prévia</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className={previewTab === "chat" ? "block" : "hidden sm:block"}>{chatPane}</div>
        <div className={previewTab === "preview" ? "block" : "hidden sm:block"}>{previewPane}</div>
      </div>
    </div>
  );
}

export default function AiSiteBuilder() {
  const [projects, setProjects] = useState(null);
  const [clients, setClients] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api("/api/ai-sites");
      setProjects(res.projects);
    } catch (err) {
      setError(err.message);
      setProjects([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/api/clients").then(setClients).catch(() => setClients([])); }, []);

  async function remove(id, e) {
    e.stopPropagation();
    if (!confirm("Remover esse projeto de site? A conversa e o site gerado somem junto.")) return;
    try {
      await api(`/api/ai-sites/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (openId) {
    return <ProjectChat projectId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-inkfaint">
        Descreva o site que você precisa pra um cliente e a IA gera a página com prévia ao vivo, do lado — igual um chat, só que o resultado é o site pronto pra baixar. Uso interno da equipe.
      </p>
      <NewProjectForm clients={clients} onCreated={(p) => { setProjects((prev) => [{ ...p, clientName: null, createdByName: null, messageCount: 0 }, ...(prev || [])]); setOpenId(p.id); }} />

      {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-surface border border-border rounded-xl shadow-sm divide-y divide-border">
        {projects === null && <div className="px-4 py-6 text-center text-xs text-inkfaint">Carregando projetos…</div>}
        {projects !== null && projects.length === 0 && <div className="px-4 py-6 text-center text-xs text-inkfaint">Nenhum projeto de site ainda — crie o primeiro acima.</div>}
        {projects && projects.map((p) => (
          <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface2/60 transition">
            <div className="min-w-0">
              <div className="text-sm text-ink truncate">{p.name}</div>
              <div className="text-[11px] text-inkfaint truncate">{p.clientName ? `Cliente: ${p.clientName} · ` : ""}{p.messageCount} mensage{p.messageCount === 1 ? "m" : "ns"} · atualizado {fmtDate(p.updatedAt)}</div>
            </div>
            <span onClick={(e) => remove(p.id, e)} className="shrink-0 text-[11px] text-inkfaint hover:text-danger transition">remover</span>
          </button>
        ))}
      </div>
    </div>
  );
}
