// Service worker mínimo — existe só pra habilitar a instalação do PWA
// ("Instalar aplicativo" no navegador). Não guarda nenhum cache de páginas,
// dados ou chamadas de API: o sistema muda o tempo todo (leads, mensagens,
// financeiro), então cache aqui só ia gerar tela desatualizada. Toda
// requisição segue direto pra rede, como se o service worker nem existisse.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// Notificações push (13/09/2026) — o backend manda um JSON
// { title, body, tag, url } (ver backend/src/lib/push.js). Mostra a
// notificação do sistema (toque = padrão do SO/navegador enquanto o app
// está em segundo plano; nenhum navegador permite som customizado nesse
// caso) e também avisa qualquer aba aberta do app via postMessage — é isso
// que deixa o componente PushNotifications.js tocar o "toque premium"
// próprio (sintetizado, sem depender de arquivo de áudio) quando o app está
// em primeiro plano.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "TurbinaADS", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "TurbinaADS";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "push-received", title, body: options.body }));
      }),
    ])
  );
});

// Clicar na notificação foca uma aba já aberta do app (se existir) ou abre
// uma nova, na página relacionada ao aviso (dashboard, portal ou
// paciente-portal, conforme o "url" que veio no push).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
