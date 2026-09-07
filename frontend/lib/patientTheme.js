// Paleta de cores do portal do paciente, escolhida pelo profissional (cliente
// da agência) na aba de Marca. Duas escolhas independentes — cor principal
// (fundo) e cor de detalhe (destaque/botões) — cada uma dentre 5 opções:
// branco, azul, rosa, bege, preto. `null`/`undefined` em qualquer uma delas
// significa "não configurado" e o portal mantém a aparência escura padrão
// (a mesma usada hoje, sem nenhuma mudança visual).

export const THEME_COLOR_OPTIONS = [
  { value: "branco", label: "Branco", swatch: "#ffffff" },
  { value: "azul", label: "Azul", swatch: "#2f6fed" },
  { value: "rosa", label: "Rosa", swatch: "#ff6f9c" },
  { value: "bege", label: "Bege", swatch: "#e2d6bd" },
  { value: "preto", label: "Preto", swatch: "#161616" },
];

// Famílias de fundo — cobrem bg/surface/surface2/border/ink/inksoft/inkfaint,
// os mesmos papéis usados hoje pelo tema escuro fixo do painel interno.
const BG_FAMILIES = {
  branco: {
    bg: "#ffffff",
    surface: "#f7f6f4",
    surface2: "#eeece8",
    border: "#ddd9d2",
    ink: "#201f1c",
    inksoft: "#55514a",
    inkfaint: "#8b867c",
  },
  azul: {
    bg: "#0d1b2a",
    surface: "#16283c",
    surface2: "#1e3550",
    border: "#2c4a68",
    ink: "#f2f6fa",
    inksoft: "#b7c6d6",
    inkfaint: "#7f93a8",
  },
  rosa: {
    bg: "#2a1620",
    surface: "#3c1f2e",
    surface2: "#4d2839",
    border: "#6b3548",
    ink: "#faf1f4",
    inksoft: "#d6b3c0",
    inkfaint: "#a8808f",
  },
  bege: {
    bg: "#f5efe4",
    surface: "#ece3d1",
    surface2: "#e2d6bd",
    border: "#cdbb99",
    ink: "#2c2418",
    inksoft: "#6b5d45",
    inkfaint: "#93805e",
  },
  preto: {
    // Igual ao tema escuro padrão da TurbinaADS hoje — escolher "preto" como
    // cor principal deixa o portal do paciente visualmente idêntico ao atual.
    bg: "#0b0b0c",
    surface: "#161616",
    surface2: "#1f1f20",
    border: "#2b2a28",
    ink: "#f5f3ef",
    inksoft: "#b6b0a6",
    inkfaint: "#79746c",
  },
};

// Famílias de destaque — accent/accentInk (hover/ativo)/onAccent (texto em
// cima do accent). accentSoft é derivado automaticamente (accent com baixa
// opacidade), então não precisa de uma variante própria por família.
const ACCENT_FAMILIES = {
  branco: { accent: "#f2f2f0", accentInk: "#d8d5cd", onAccent: "#1a1a1a" },
  azul: { accent: "#2f6fed", accentInk: "#1d54c4", onAccent: "#ffffff" },
  rosa: { accent: "#ff6f9c", accentInk: "#e0507f", onAccent: "#ffffff" },
  bege: { accent: "#cdaa6b", accentInk: "#b3904f", onAccent: "#241d0f" },
  preto: { accent: "#ff7a1a", accentInk: "#e0630a", onAccent: "#ffffff" }, // mesmo laranja padrão de hoje
};

// Monta o objeto de CSS custom properties (--pb-*) prontas pra jogar no
// `style` de um wrapper div. Só inclui variáveis quando bgKey/accentKey estão
// configurados — sem isso, o CSS em globals.css cai nos valores hardcoded
// atuais (fallback do var()), preservando 100% a aparência de quem nunca
// configurou nada.
export function getPatientThemeVars(bgKey, accentKey) {
  const vars = {};
  const bg = BG_FAMILIES[bgKey];
  if (bg) {
    vars["--pb-bg"] = bg.bg;
    vars["--pb-surface"] = bg.surface;
    vars["--pb-surface2"] = bg.surface2;
    vars["--pb-border"] = bg.border;
    vars["--pb-ink"] = bg.ink;
    vars["--pb-inksoft"] = bg.inksoft;
    vars["--pb-inkfaint"] = bg.inkfaint;
  }
  const accent = ACCENT_FAMILIES[accentKey];
  if (accent) {
    vars["--pb-accent"] = accent.accent;
    vars["--pb-accentink"] = accent.accentInk;
    vars["--pb-onaccent"] = accent.onAccent;
    vars["--pb-accentsoft"] = `${accent.accent}26`; // ~15% opacity, hex alpha suffix
  }
  return vars;
}
