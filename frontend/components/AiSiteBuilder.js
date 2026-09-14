"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

// Publicação de sites em HTML pronto (14/09/2026) — o site em si é feito do
// jeito que a equipe já faz normalmente (ex: no chat com a IA aqui direto),
// baixado como .html e subido aqui só pra publicar/atualizar no ar via
// Netlify, com o início do subdomínio escolhido na hora. Substitui a versão
// anterior (chat + IA gerando o site aos poucos com upload de foto/vídeo),
// removida a pedido da sócia — o resultado automático não ficava bom.
//
// Dois lugares usam esse mesmo arquivo: a tela central "Publicar site" (aba
// de Assistentes IA — export default, lista TODOS os sites) e um painel
// compacto dentro da própria página do cliente (export ClientSitePanel —
// mostra só o site daquele cliente, sem precisar escolher).

const MAX_HTML_MB = 28; // folga sob o limite de 30MB do backend

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function readHtmlFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith(".html") && file.type !== "text/html") {
      reject(new Error("Selecione um arquivo .html."));
      return;
    }
    if (file.size > MAX_HTML_MB * 1024 * 1024) {
      reject(new Error(`Esse arquivo passa de ${MAX_HTML_MB}MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

function slugPreview(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Formulário de publicação de um site NOVO — usado tanto na tela central
// (com seletor de cliente) quanto no painel do cliente (clientId fixo).
function PublishForm({ clients, fixedClientId, defaultName, onPublished }) {
  const [name, setName] = useState(defaultName || "");
  const [subdomain, setSubdomain] = useState("");
  const [clientId, setClientId] = useState(fixedClientId || "");
  const [file, setFile] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !subdomain.trim() || !file || publishing) return;
    setPublishing(true);
    setError("");
    try {
      const html = await readHtmlFile(file);
      const project = await api("/api/ai-sites/publish", {
        method: "POST",
        body: { name: name.trim(), subdomain: subdomain.trim(), clientId: (fixedClientId || clientId) || undefined, html },
      });
      setName(defaultName || "");
      setSubdomain("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onPublished(project);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-xl shadow-sm p-3 space-y-2.5">
      <p className="text-xs font-medium text-ink">Publicar site novo</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do site (ex: Site Dra. Ana)"
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink" />
        {!fixedClientId && (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink sm:w-56">
            <option value="">Sem cliente vinculado</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="inicio-do-link"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface2 text-ink" />
          <span className="text-xs text-inkfaint shrink-0">.netlify.app</span>
        </div>
        {subdomain.trim() && (
          <p className="text-[11px] text-inkfaint mt-1">
            Vai ficar em <span className="text-ink">{slugPreview(subdomain) || "site"}.netlify.app</span>
            {slugPreview(subdomain) !== subdomain.trim() && " (ajustado pra caber no formato do link)"}
            {" — se esse nome já estiver em uso, a Netlify adiciona um número no final automaticamente."}
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <input ref={fileInputRef} type="file" accept=".html,text/html" onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs text-inksoft file:mr-2 file:px-2.5 file:py-1.5 file:rounded-md file:border file:border-border file:bg-surface2 file:text-inksoft file:text-xs" />
        <button disabled={publishing || !name.trim() || !subdomain.trim() || !file}
          className="shrink-0 bg-accent text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60">
          {publishing ? "Publicando…" : "Publicar"}
        </button>
      </div>
      {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
    </form>
  );
}

// Um site já publicado — link, cliente, data, e ações (atualizar/copiar/
// abrir/remover). "Atualizar" sobe um novo .html mantendo o mesmo link.
function SiteRow({ project, showClient, onUpdated, onRemoved }) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function handleUpdateFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUpdating(true);
    setError("");
    try {
      const html = await readHtmlFile(file);
      const updated = await api("/api/ai-sites/publish", { method: "POST", body: { projectId: project.id, html } });
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  }

  async function remove() {
    if (!confirm(`Remover "${project.name}" dessa lista? O site continua no ar na Netlify — isso só tira ele daqui do sistema.`)) return;
    try {
      await api(`/api/ai-sites/${project.id}`, { method: "DELETE" });
      onRemoved(project.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="px-3.5 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm text-ink truncate">{project.name}</div>
          <div className="text-[11px] text-inkfaint truncate">
            {showClient && project.clientName ? `Cliente: ${project.clientName} · ` : ""}
            publicado {fmtDate(project.publishedAt)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {project.netlifyUrl && (
            <a href={project.netlifyUrl} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-accent hover:underline">
              abrir
            </a>
          )}
          <button type="button" onClick={() => project.netlifyUrl && navigator.clipboard?.writeText(project.netlifyUrl)}
            className="text-[11.5px] text-inkfaint hover:text-ink">
            copiar link
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={updating}
            className="text-[11.5px] font-medium bg-surface2 border border-border text-inksoft hover:text-ink px-2.5 py-1 rounded-md transition disabled:opacity-60">
            {updating ? "Atualizando…" : "Atualizar"}
          </button>
          <input ref={fileInputRef} type="file" accept=".html,text/html" className="hidden" onChange={handleUpdateFile} />
          <button type="button" onClick={remove} className="text-[11.5px] text-inkfaint hover:text-danger transition">
            remover
          </button>
        </div>
      </div>
      {project.netlifyUrl && <div className="text-[11px] text-inksoft truncate">{project.netlifyUrl.replace(/^https?:\/\//, "")}</div>}
      {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
    </div>
  );
}

// Tela central (aba "Publicar site" dentro de Assistentes IA) — lista TODOS
// os sites que o usuário tem acesso, com formulário de publicar um novo.
export default function AiSiteBuilder() {
  const [projects, setProjects] = useState(null);
  const [clients, setClients] = useState([]);
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

  return (
    <div className="space-y-3">
      <p className="text-xs text-inkfaint">
        Suba o arquivo .html de um site pronto (ex: baixado daqui do chat com a IA) pra publicar direto no ar, com o início do link que você escolher. Uso interno da equipe.
      </p>
      <PublishForm clients={clients} onPublished={(p) => { setProjects((prev) => [p, ...(prev || [])]); }} />

      {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-surface border border-border rounded-xl shadow-sm divide-y divide-border">
        {projects === null && <div className="px-4 py-6 text-center text-xs text-inkfaint">Carregando sites…</div>}
        {projects !== null && projects.length === 0 && <div className="px-4 py-6 text-center text-xs text-inkfaint">Nenhum site publicado ainda — publique o primeiro acima.</div>}
        {projects && projects.map((p) => (
          <SiteRow key={p.id} project={p} showClient
            onUpdated={(updated) => setProjects((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
            onRemoved={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </div>
    </div>
  );
}

// Painel compacto pra embutir dentro da página do cliente — mostra só
// o(s) site(s) desse cliente, com cliente já fixo (não precisa escolher de
// novo) e a mesma possibilidade de atualizar o site publicado.
export function ClientSitePanel({ clientId, clientName }) {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/ai-sites?clientId=${clientId}`);
      setProjects(res.projects);
    } catch (err) {
      setError(err.message);
      setProjects([]);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-ink">🌐 Site do cliente</span>
        {projects !== null && projects.length > 0 && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-[11px] text-accent hover:underline">+ publicar outro site</button>
        )}
      </div>

      {projects === null && <div className="px-4 py-4 text-center text-xs text-inkfaint">Carregando…</div>}

      {projects !== null && projects.length === 0 && !showForm && (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-inkfaint mb-2.5">Esse cliente ainda não tem site publicado pelo sistema.</p>
          <button onClick={() => setShowForm(true)} className="text-xs font-medium bg-accent text-white px-3 py-1.5 rounded-md hover:bg-accentink">
            Publicar site
          </button>
        </div>
      )}

      {showForm && (
        <div className="p-3">
          <PublishForm clients={[]} fixedClientId={clientId} defaultName={`Site ${clientName || ""}`.trim()}
            onPublished={(p) => { setProjects((prev) => [p, ...(prev || [])]); setShowForm(false); }} />
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <div className="divide-y divide-border">
          {projects.map((p) => (
            <SiteRow key={p.id} project={p}
              onUpdated={(updated) => setProjects((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
              onRemoved={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}

      {error && <div className="mx-3 mb-3 text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
    </div>
  );
}
