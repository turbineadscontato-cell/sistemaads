"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getUser } from "../lib/api";

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "";
const GRAPH_VERSION = "v21.0";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function currency(n, cur) {
  if (n == null) return "—";
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: cur || "BRL" });
  } catch {
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
}

const DATE_PRESETS = [
  { key: "last_7d", label: "Últimos 7 dias" },
  { key: "last_30d", label: "Últimos 30 dias" },
  { key: "this_month", label: "Este mês" },
  { key: "last_month", label: "Mês passado" },
];

// Loads the Facebook JS SDK once and resolves when it's ready to use.
let fbSdkPromise = null;
function loadFacebookSdk() {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("SDK indisponível."));
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = function () {
      window.FB.init({ appId: META_APP_ID, cookie: false, xfbml: false, version: GRAPH_VERSION });
      resolve(window.FB);
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return; // fbAsyncInit above will still fire
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Não foi possível carregar o SDK do Facebook."));
    document.body.appendChild(script);
  });
  return fbSdkPromise;
}

export default function Campaigns() {
  const user = getUser();
  const isSocio = user?.role === "SOCIO";

  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [insightsById, setInsightsById] = useState({});
  const [presetById, setPresetById] = useState({});
  const [loadingInsightsId, setLoadingInsightsId] = useState(null);
  const [sdkError, setSdkError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const calls = [api("/api/meta/status"), api("/api/meta/ad-accounts")];
      const [s, a] = await Promise.all(calls);
      setStatus(s);
      setAccounts(a);
      if (isSocio) setClients(await api("/api/clients"));
    } catch (err) {
      // surfaced inline below via status being null
    } finally {
      setLoading(false);
    }
  }, [isSocio]);

  useEffect(() => {
    load();
  }, [load]);

  async function connect() {
    if (!META_APP_ID) {
      setSdkError("NEXT_PUBLIC_META_APP_ID não configurado no frontend (Vercel).");
      return;
    }
    setConnecting(true);
    setSdkError("");
    try {
      const FB = await loadFacebookSdk();
      FB.login(
        async (response) => {
          if (response.authResponse?.accessToken) {
            try {
              await api("/api/meta/connect", { method: "POST", body: { accessToken: response.authResponse.accessToken } });
              load();
            } catch (err) {
              setSdkError(err.message);
            }
          } else {
            setSdkError("Login com o Facebook cancelado ou sem permissão concedida.");
          }
          setConnecting(false);
        },
        { scope: "ads_read,ads_management" }
      );
    } catch (err) {
      setSdkError(err.message);
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm("Desconectar a conta do Meta? As contas de anúncio mapeadas continuam salvas, mas as métricas param de atualizar até reconectar.")) return;
    try {
      await api("/api/meta/disconnect", { method: "POST" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function syncAccounts() {
    setSyncing(true);
    try {
      await api("/api/meta/sync-accounts", { method: "POST" });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function mapClient(accountId, clientId) {
    try {
      await api(`/api/meta/ad-accounts/${accountId}`, { method: "PATCH", body: { clientId: clientId || null } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleInsights(account) {
    if (expandedId === account.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(account.id);
    if (!insightsById[account.id]) fetchInsights(account.id, presetById[account.id] || "last_30d");
  }

  async function fetchInsights(accountId, preset) {
    setLoadingInsightsId(accountId);
    try {
      const data = await api(`/api/meta/ad-accounts/${accountId}/insights?datePreset=${preset}`);
      setInsightsById((m) => ({ ...m, [accountId]: data }));
      setPresetById((m) => ({ ...m, [accountId]: preset }));
    } catch (err) {
      setInsightsById((m) => ({ ...m, [accountId]: { error: err.message } }));
    } finally {
      setLoadingInsightsId(null);
    }
  }

  if (loading) return <div className="text-xs text-inkfaint">Carregando campanhas…</div>;

  const connected = status?.connected;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="font-display font-semibold text-lg text-ink">Campanhas</h1>
        <p className="text-[11px] text-inkfaint mt-0.5">
          Veja em um só lugar como estão as contas de anúncio dos seus clientes — gasto, CPC, CPM, CTR e leads.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <div className="text-sm text-ink font-medium">
            {connected ? `Conectado como ${status.metaUserName || "conta do Meta"}` : "Nenhuma conta do Meta conectada"}
          </div>
          <div className="text-[11px] text-inkfaint mt-0.5">
            {connected
              ? `Conectado em ${fmtDate(status.connectedAt)}${status.tokenExpiresAt ? ` · expira em ${fmtDate(status.tokenExpiresAt)}` : ""}`
              : isSocio
                ? "Conecte a conta de anúncios do Facebook para trazer as métricas das campanhas dos clientes."
                : "Peça a um sócio para conectar a conta de anúncios do Facebook."}
          </div>
          {status?.expired && <div className="text-[11px] text-warning mt-0.5">A conexão expirou — reconecte para continuar vendo métricas atualizadas.</div>}
        </div>
        {isSocio && (
          <div className="flex items-center gap-2 shrink-0">
            {connected && (
              <button onClick={syncAccounts} disabled={syncing}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-border text-inksoft hover:text-accent hover:border-accent disabled:opacity-60">
                {syncing ? "Sincronizando…" : "Sincronizar contas"}
              </button>
            )}
            <button onClick={connected ? disconnect : connect} disabled={connecting}
              className={`text-xs font-medium px-3 py-1.5 rounded-md ${connected ? "border border-danger/40 text-danger hover:bg-dangersoft" : "bg-accent text-white hover:bg-accentink"} disabled:opacity-60`}>
              {connecting ? "Conectando…" : connected ? "Desconectar" : "Conectar conta do Facebook"}
            </button>
          </div>
        )}
      </div>

      {sdkError && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{sdkError}</div>}

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm text-ink">Contas de anúncio</h2>
          <span className="text-xs text-inkfaint">{accounts.length}</span>
        </div>
        <div className="divide-y divide-border">
          {accounts.map((acc) => {
            const expanded = expandedId === acc.id;
            const insights = insightsById[acc.id];
            return (
              <div key={acc.id}>
                <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium truncate">{acc.name}</div>
                    <div className="text-[10.5px] text-inkfaint mono truncate">{acc.metaAccountId} · {acc.accountStatus || "status desconhecido"}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSocio ? (
                      <select value={acc.clientId || ""} onChange={(e) => mapClient(acc.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-md border border-border bg-surface2 text-ink">
                        <option value="">Sem cliente vinculado</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-inksoft">{acc.client?.name || "Sem cliente vinculado"}</span>
                    )}
                    <button onClick={() => toggleInsights(acc)} className="text-xs font-medium text-accent hover:underline shrink-0">
                      {expanded ? "Ocultar" : "Ver métricas"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 bg-surface2/40 border-t border-border pt-3">
                    <div className="flex gap-1 mb-3">
                      {DATE_PRESETS.map((p) => (
                        <button key={p.key} onClick={() => fetchInsights(acc.id, p.key)}
                          className={`text-[10.5px] px-2 py-1 rounded-md border font-medium ${
                            (presetById[acc.id] || "last_30d") === p.key ? "bg-accent border-accent text-white" : "border-border text-inksoft hover:border-accent"
                          }`}>
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {loadingInsightsId === acc.id && <div className="text-xs text-inkfaint">Carregando métricas…</div>}

                    {insights?.error && <div className="text-xs text-danger">{insights.error}</div>}

                    {insights && !insights.error && !insights.hasData && (
                      <div className="text-xs text-inkfaint">Sem dados de campanha nesse período.</div>
                    )}

                    {insights && !insights.error && insights.hasData && (
                      <div className="space-y-2.5">
                        {insights.alerts?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {insights.alerts.map((a, i) => (
                              <span key={i} className="text-[10.5px] px-2 py-1 rounded-full bg-dangersoft text-danger font-medium">⚠ {a}</span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            ["Gasto", currency(insights.spend, acc.currency)],
                            ["Impressões", insights.impressions?.toLocaleString("pt-BR")],
                            ["Cliques", insights.clicks?.toLocaleString("pt-BR")],
                            ["CTR", `${insights.ctr?.toFixed(2)}%`],
                            ["CPC", currency(insights.cpc, acc.currency)],
                            ["CPM", currency(insights.cpm, acc.currency)],
                            ["Frequência", insights.frequency?.toFixed(2)],
                            ["Leads", insights.leadsCount],
                            ["Custo por lead", insights.costPerLead != null ? currency(insights.costPerLead, acc.currency) : "—"],
                          ].map(([label, value]) => (
                            <div key={label} className="bg-surface border border-border rounded-lg px-2.5 py-2">
                              <div className="text-[10px] uppercase tracking-wide text-inkfaint">{label}</div>
                              <div className="text-sm font-semibold text-ink mono mt-0.5">{value ?? "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {accounts.length === 0 && (
            <div className="px-4 py-8 text-center text-inkfaint text-xs">
              {isSocio ? "Nenhuma conta de anúncio sincronizada ainda — conecte sua conta e clique em Sincronizar contas." : "Nenhuma conta de anúncio vinculada a você ainda."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
