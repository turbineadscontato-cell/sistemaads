"use client";

import { useEffect } from "react";

// Registra o service worker mínimo (public/sw.js) assim que o app carrega no
// navegador — é isso que faz Chrome/Edge/Safari considerarem o site
// "instalável" como app. Não faz nada visível; só precisa rodar uma vez.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // instalação como app é um "extra"; se falhar, o sistema continua
        // funcionando normalmente pelo navegador, sem nenhum impacto.
      });
    }
  }, []);

  return null;
}
