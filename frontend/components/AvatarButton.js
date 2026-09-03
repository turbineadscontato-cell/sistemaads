"use client";

import { useRef, useState } from "react";
import { api } from "../lib/api";

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const MAX_DIM = 256; // lado máximo, em pixels, depois de redimensionada

// Redimensiona a imagem escolhida no navegador (canvas) antes de enviar —
// uma foto de câmera de celular vem com vários MB; isso comprime pra um
// JPEG pequeno (algumas dezenas de KB) sem precisar de nenhum servidor de
// upload/CDN separado, então continua funcionando dentro do fluxo de deploy
// manual via zip que já existe pro resto do sistema.
function resizeToDataUrl(file) {
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
        // fundo sólido antes de desenhar — evita PNG transparente virar
        // preto quando comprimido como JPEG.
        ctx.fillStyle = "#161616";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Avatar clicável e auto-suficiente: mostra a foto (ou as iniciais, se não
// tiver foto ainda), e ao clicar abre o seletor de arquivo, redimensiona,
// envia pra API e avisa o componente pai via onSaved — usado tanto no
// painel interno (sócio/gestor/atendente) quanto no portal do cliente.
export default function AvatarButton({ src, name, onSaved, size = 36 }) {
  const inputRef = useRef(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 8_000_000) {
      alert("Imagem muito grande — escolha um arquivo de até 8MB.");
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      const updated = await api("/api/auth/avatar", { method: "PATCH", body: { avatarUrl: dataUrl } });
      onSaved?.(updated.avatarUrl);
    } catch (err) {
      alert(err.message || "Não foi possível atualizar a foto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={saving}
      title="Trocar foto de perfil"
      className="relative shrink-0 rounded-full overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full bg-gradient-to-br from-accent to-accentink text-white font-bold flex items-center justify-center"
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
        <svg width={Math.round(size * 0.42)} height={Math.round(size * 0.42)} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.1l1-1.5h6.8l1 1.5h2.1A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      </div>
      {saving && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </button>
  );
}
