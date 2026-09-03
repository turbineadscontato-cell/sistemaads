// Nível/patente gamificada de gestor e atendente — puramente simbólico,
// definido manualmente pelo sócio na tela de Usuários. Ordem crescente:
// Bronze < Prata < Ouro < Platina < Dragão.
export const RANKS = [
  { key: "BRONZE", label: "Bronze", emoji: "🥉", cls: "bg-[#4a3626] text-[#e8b98a] border-[#7a5a3a]" },
  { key: "PRATA", label: "Prata", emoji: "🥈", cls: "bg-surface2 text-[#cfd6e0] border-[#8b95a5]" },
  { key: "OURO", label: "Ouro", emoji: "🥇", cls: "bg-warningsoft text-warning border-warning/40" },
  { key: "PLATINA", label: "Platina", emoji: "💎", cls: "bg-accentsoft text-accent border-accent/40" },
  { key: "DRAGAO", label: "Dragão", emoji: "🐉", cls: "bg-dangersoft text-danger border-danger/40" },
];

export function rankMeta(key) {
  return RANKS.find((r) => r.key === key) || RANKS[0];
}
