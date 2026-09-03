"use client";

import { rankMeta } from "../lib/rank";

// Brasão animado do nível do gestor/atendente — "como simbolo de animacao,
// coloque emojis nesses brazao pra ficar legal". Dragão (nível máximo) ganha
// um leve brilho pulsante pra se destacar das demais patentes.
export default function RankBadge({ rank, size = "md" }) {
  const meta = rankMeta(rank);
  const isTop = meta.key === "DRAGAO";
  const sizeCls = size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-[11.5px] px-2.5 py-1 gap-1.5";
  const emojiSize = size === "sm" ? "text-xs" : "text-sm";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${sizeCls} ${meta.cls} ${isTop ? "animate-rank-glow" : ""}`}
      title={`Nível: ${meta.label}`}
    >
      <span className={`${emojiSize} ${isTop ? "animate-rank-bounce" : ""}`} aria-hidden>{meta.emoji}</span>
      {meta.label}
      <style jsx>{`
        @keyframes rankGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 90, 60, 0.35); }
          50% { box-shadow: 0 0 8px 1px rgba(255, 90, 60, 0.45); }
        }
        .animate-rank-glow { animation: rankGlow 2.2s ease-in-out infinite; }
        @keyframes rankBounce {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-2px) rotate(-6deg); }
          75% { transform: translateY(-1px) rotate(6deg); }
        }
        .animate-rank-bounce { display: inline-block; animation: rankBounce 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-rank-glow, .animate-rank-bounce { animation: none; }
        }
      `}</style>
    </span>
  );
}
