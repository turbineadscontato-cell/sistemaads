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
