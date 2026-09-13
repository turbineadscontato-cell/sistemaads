"use client";

import { useEffect, useRef, useState } from "react";
import { api, getUser } from "../lib/api";

// Notificações push com toque (13/09/2026) — componente global, montado uma
// vez no layout raiz (igual ServiceWorkerRegister) e funciona pra qualquer
// login: sócio/gestor/atendente no painel interno, cliente e paciente nos
// respectivos portais. A mesma "sininho" serve pros três, porque todos
// pedem CLIENTE/PACIENTE/SOCIO/GESTOR/ATENDENTE saem da mesma tabela de
// usuário — não precisa de versão separada por área.
//
// LIMITAÇÃO REAL DO NAVEGADOR (não é coisa que dá pra contornar no código):
// com o app fechado ou minimizado, o toque da notificação é sempre o som
// padrão do sistema/navegador — nenhum Chrome, Firefox ou Safari permite
// tocar um arquivo de som próprio numa notificação em segundo plano. O
// "toque premium" que a gente criou (playPremiumChime, logo abaixo) só toca
// enquanto o app está aberto na tela — é o máximo que a plataforma permite.

const DISMISS_KEY = "tads_push_dismissed_at";
const DISMISS_DAYS = 7;

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Toque "premium" sintetizado na hora via Web Audio API — um arpejo curto e
// suave (três notas ascendentes com uma cauda de reverb leve), sem depender
// de nenhum arquivo de áudio. Só toca com o app aberto (ver aviso acima).
let sharedAudioCtx = null;
function getAudioCtx() {
  if (sharedAudioCtx) return sharedAudioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  sharedAudioCtx = new Ctx();
  return sharedAudioCtx;
}

function playPremiumChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  const notes = [
    { freq: 880.0, start: 0, dur: 0.22 }, // A5
    { freq: 1108.73, start: 0.13, dur: 0.28 }, // C#6
    { freq: 1318.51, start: 0.28, dur: 0.48 }, // E6
  ];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4200;
  filter.connect(ctx.destination);

  notes.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t0 = now + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(filter);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  });
}

function recentlyDismissed() {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch (err) {
    return false;
  }
}

export default function PushNotifications() {
  const [user, setUser] = useState(null);
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testSent, setTestSent] = useState(false);
  const setupDone = useRef(false);

  // Descobre se tem alguém logado — sem depender de remontagem: o layout
  // raiz não remonta ao navegar entre páginas, então esse polling leve é o
  // jeito simples de notar um login/logout feito na mesma aba.
  useEffect(() => {
    function sync() { setUser(getUser()); }
    sync();
    const id = setInterval(sync, 3000);
    return () => clearInterval(id);
  }, []);

  // Verifica silenciosamente, uma vez por login, se já existe inscrição
  // ativa (outro dia, mesmo navegador) e mantém o backend sincronizado —
  // sem pedir permissão de novo se ela já foi concedida antes.
  useEffect(() => {
    if (!user || !supported() || setupDone.current) return;
    setupDone.current = true;

    (async () => {
      const perm = Notification.permission;
      setPermission(perm);
      if (perm === "denied") return;

      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSubscribed(true);
          await api("/api/push/subscribe", { method: "POST", body: existing.toJSON() }).catch(() => {});
          return;
        }
        if (perm === "granted") {
          // Permissão já concedida antes (ex: trocou de dispositivo com o
          // mesmo perfil do navegador) — reinscreve sem precisar de outro
          // clique, já que o navegador não exige gesto do usuário quando a
          // permissão já está concedida.
          await activateSubscription(reg);
        } else if (!recentlyDismissed()) {
          setShowPrompt(true);
        }
      } catch (err) {
        // Sem service worker pronto ainda ou outro erro silencioso — não é
        // crítico, só não mostra nada.
      }
    })();
  }, [user]);

  // Ouve o service worker: quando um push chega com o app aberto (aba em
  // primeiro plano), toca o toque premium por cima da notificação do
  // sistema (que também aparece, com o som padrão do navegador).
  useEffect(() => {
    if (!supported()) return;
    function onMessage(event) {
      if (event.data?.type === "push-received") playPremiumChime();
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  async function activateSubscription(regParam) {
    const { publicKey, configured } = await api("/api/push/public-key");
    if (!configured || !publicKey) {
      setError("Notificações ainda não configuradas no servidor (faltam as chaves VAPID no Railway).");
      return false;
    }
    const reg = regParam || (await navigator.serviceWorker.ready);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api("/api/push/subscribe", { method: "POST", body: sub.toJSON() });
    setSubscribed(true);
    return true;
  }

  async function handleActivate() {
    setBusy(true);
    setError("");
    // O clique é o "gesto do usuário" que libera o áudio pra tocar mais
    // tarde sem precisar de outro clique — cria/retoma o contexto aqui.
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(perm === "denied" ? "Notificações bloqueadas no navegador — pra ativar depois, libere nas configurações do site." : "Permissão não concedida.");
        setShowPrompt(false);
        return;
      }
      const ok = await activateSubscription();
      if (ok) setShowPrompt(false);
    } catch (err) {
      setError("Não deu pra ativar as notificações agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    setShowPrompt(false);
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (err) {}
  }

  async function handleTest() {
    setBusy(true);
    setError("");
    setTestSent(false);
    try {
      await api("/api/push/test", { method: "POST" });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setPanelOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!user || !supported()) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      {showPrompt && !subscribed && (
        <div className="w-[280px] bg-surface border border-border rounded-xl shadow-xl p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">🔔</span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink leading-snug">Ativar notificações?</p>
              <p className="text-[11.5px] text-inkfaint leading-snug mt-0.5">
                Avisos com toque no próprio app: pagamento, reunião, cliente novo ou sessão marcada — sem precisar ficar checando.
              </p>
            </div>
          </div>
          {error && <p className="text-[11px] text-danger">{error}</p>}
          <div className="flex gap-1.5">
            <button onClick={handleActivate} disabled={busy}
              className="flex-1 bg-accent text-white text-[12.5px] font-medium px-3 py-1.5 rounded-md hover:bg-accentink disabled:opacity-60">
              {busy ? "Ativando…" : "Ativar"}
            </button>
            <button onClick={handleDismiss} className="text-[12.5px] text-inkfaint hover:text-ink px-2">Agora não</button>
          </div>
        </div>
      )}

      {subscribed && panelOpen && (
        <div className="w-[240px] bg-surface border border-border rounded-xl shadow-xl p-3.5 space-y-2.5">
          <p className="text-[12.5px] font-medium text-ink">🔔 Notificações ativadas</p>
          <p className="text-[11px] text-inkfaint leading-snug">
            Com o app aberto, o aviso toca um som próprio. Com o app fechado, toca o som padrão do celular/navegador — isso é uma limitação do sistema, nenhum app consegue mudar isso quando está em segundo plano.
          </p>
          {error && <p className="text-[11px] text-danger">{error}</p>}
          {testSent && <p className="text-[11px] text-accent">Enviado — deve chegar em instantes.</p>}
          <div className="flex gap-1.5">
            <button onClick={handleTest} disabled={busy}
              className="flex-1 bg-surface2 border border-border text-ink text-[12px] font-medium px-2.5 py-1.5 rounded-md hover:border-accent/50 disabled:opacity-60">
              Testar
            </button>
            <button onClick={handleDeactivate} disabled={busy}
              className="text-[12px] text-danger hover:underline px-1">
              Desativar
            </button>
          </div>
        </div>
      )}

      {subscribed && (
        <button onClick={() => setPanelOpen((v) => !v)} aria-label="Notificações"
          className="w-9 h-9 rounded-full bg-surface border border-border shadow-lg flex items-center justify-center text-base hover:border-accent/50 transition">
          🔔
        </button>
      )}
    </div>
  );
}
