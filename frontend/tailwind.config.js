/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0c",
        surface: "#161616",
        surface2: "#1f1f20",
        ink: "#f5f3ef",
        inksoft: "#b6b0a6",
        inkfaint: "#79746c",
        border: "#2b2a28",
        accent: "#ff7a1a",
        accentink: "#e0630a",
        accentsoft: "#2b1608",
        success: "#3ecf8e",
        successsoft: "#123024",
        warning: "#f0b429",
        warningsoft: "#332405",
        danger: "#ff5c5c",
        dangersoft: "#341313",
        sidebar: "#000000",
      },
      // "4.5" isn't part of Tailwind's default spacing scale (it jumps from
      // 4 → 1rem straight to 5 → 1.25rem) — without this, every existing
      // px-4.5/py-4.5/p-4.5 class across the app (table cells, card headers,
      // panels) silently generated NO padding at all. Adding the missing
      // step here fixes every one of those spots at once, app-wide.
      spacing: {
        "4.5": "1.125rem",
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        body: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
