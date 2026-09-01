"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const STATUS_LABEL = { planejado: "Planejado", produzido: "Produzido", publicado: "Publicado" };
const STATUS_CLASS = {
  planejado: "bg-warningsoft text-warning",
  produzido: "bg-accentsoft text-accent",
  publicado: "bg-successsoft text-success",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_POST = { scheduledDate: "", title: "", theme: "", notes: "" };

// Marketing content calendar for the client's own social media, plus an AI
// generator that proposes a batch of dated post ideas aware of the month's
// relevant awareness dates/holidays, tuned to the client's therapeutic approach.
export default function ContentCalendar({ clientId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newPost, setNewPost] = useState(EMPTY_POST);

  const [month, setMonth] = useState(currentMonth());
  const [approach, setApproach] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = clientId ? `?clientId=${clientId}` : "";
      setPosts(await api(`/api/content-posts${qs}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const sorted = [...posts].sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
    const byMonth = {};
    for (const p of sorted) {
      const key = p.scheduledDate.slice(0, 7);
      (byMonth[key] = byMonth[key] || []).push(p);
    }
    return byMonth;
  }, [posts]);

  async function createPost(e) {
    e.preventDefault();
    if (!newPost.scheduledDate || !newPost.title.trim()) return;
    try {
      await api("/api/content-posts", { method: "POST", body: { ...newPost, clientId } });
      setNewPost(EMPTY_POST);
      setShowNew(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function updateStatus(post, status) {
    try {
      await api(`/api/content-posts/${post.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function removePost(post) {
    if (!confirm(`Remover "${post.title}" do calendário?`)) return;
    try {
      await api(`/api/content-posts/${post.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setGenError("");
    setIdeas([]);
    setSelected({});
    try {
      const res = await api("/api/ai/content-plan", { method: "POST", body: { clientId, month, approach, notes: planNotes } });
      const list = Array.isArray(res.ideas) ? res.ideas : [];
      setIdeas(list);
      setSelected(Object.fromEntries(list.map((_, i) => [i, true])));
      if (list.length === 0 && res.raw) setGenError("A IA respondeu em um formato inesperado — veja o texto bruto abaixo.");
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveSelected() {
    const items = ideas.filter((_, i) => selected[i]);
    if (items.length === 0) return;
    setSaving(true);
    try {
      await api("/api/content-posts/bulk", {
        method: "POST",
        body: { clientId, items: items.map((it) => ({ date: it.date, title: it.title, theme: it.theme, caption: it.caption_outline })) },
      });
      setIdeas([]);
      setSelected({});
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-xs text-inkfaint">Carregando calendário…</div>;

  return (
    <div className="space-y-4">
      {/* AI generator */}
      <div className="bg-surface border border-border rounded-xl shadow-sm p-3 space-y-2.5">
        <div>
          <h2 className="font-display font-semibold text-sm text-ink">Gerador de conteúdo com IA</h2>
          <p className="text-[11px] text-inkfaint">A IA sugere ideias de postagens para o mês, já considerando datas comemorativas e a sua abordagem.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
          <input value={approach} onChange={(e) => setApproach(e.target.value)} placeholder="Sua abordagem (ex: TCC, humanista, casais)"
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink sm:col-span-2" />
        </div>
        <input value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Algo específico para este mês? (opcional)"
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        <button onClick={generatePlan} disabled={generating}
          className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
          {generating ? "Gerando…" : "Gerar ideias do mês"}
        </button>
        {genError && <div className="text-[11px] text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{genError}</div>}

        {ideas.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              {ideas.map((idea, i) => (
                <label key={i} className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface2">
                  <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}
                    className="mt-1 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10.5px] mono text-inkfaint shrink-0">{idea.date}</span>
                      <span className="text-ink font-medium truncate">{idea.title}</span>
                      {idea.theme && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accentsoft text-accent shrink-0">{idea.theme}</span>}
                    </div>
                    {idea.caption_outline && <div className="text-[11px] text-inksoft mt-0.5">{idea.caption_outline}</div>}
                  </div>
                </label>
              ))}
            </div>
            <button onClick={saveSelected} disabled={saving}
              className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
              {saving ? "Salvando…" : "Salvar selecionados no calendário"}
            </button>
          </div>
        )}
      </div>

      {/* Calendar list */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="font-display font-semibold text-sm text-ink">Calendário de postagens</span>
          <button onClick={() => setShowNew((v) => !v)} className="text-[11px] text-accent hover:underline">
            {showNew ? "cancelar" : "+ adicionar manualmente"}
          </button>
        </div>
        {showNew && (
          <form onSubmit={createPost} className="flex flex-col sm:flex-row gap-2 p-3 border-b border-border">
            <input type="date" required value={newPost.scheduledDate} onChange={(e) => setNewPost({ ...newPost, scheduledDate: e.target.value })}
              className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink mono" />
            <input required placeholder="Título da postagem" value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
            <input placeholder="Tema" value={newPost.theme} onChange={(e) => setNewPost({ ...newPost, theme: e.target.value })}
              className="w-full sm:w-32 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
            <button className="bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accentink shrink-0">Adicionar</button>
          </form>
        )}
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {Object.keys(grouped).length === 0 && <div className="px-4 py-6 text-center text-inkfaint text-xs">Nenhuma postagem no calendário ainda.</div>}
          {Object.entries(grouped).map(([m, items]) => (
            <div key={m}>
              <div className="px-4 py-1.5 bg-surface2 text-[10.5px] font-semibold uppercase tracking-wide text-inkfaint mono">{m}</div>
              {items.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] mono text-inkfaint shrink-0">{fmtDate(p.scheduledDate)}</span>
                      <span className="text-ink truncate">{p.title}</span>
                    </div>
                    {(p.theme || p.notes) && <div className="text-[10.5px] text-inkfaint truncate">{p.theme}{p.theme && p.notes ? " · " : ""}{p.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select value={p.status} onChange={(e) => updateStatus(p, e.target.value)}
                      className={`text-[10.5px] px-2 py-1 rounded-full font-medium border-0 ${STATUS_CLASS[p.status]}`}>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => removePost(p)} className="text-[11px] text-danger hover:underline">remover</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
