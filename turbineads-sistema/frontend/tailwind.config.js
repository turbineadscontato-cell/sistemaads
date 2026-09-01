/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#eef1f3",
        surface: "#ffffff",
        surface2: "#f6f8f9",
        ink: "#12181f",
        inksoft: "#4c5867",
        inkfaint: "#7c8794",
        border: "#dfe4e8",
        accent: "#0f6e7a",
        accentink: "#0a4e57",
        accentsoft: "#e2f0f0",
        success: "#1e8e5a",
        successsoft: "#e3f4ea",
        warning: "#b9740f",
        warningsoft: "#faf0dc",
        danger: "#c63b3b",
        dangersoft: "#fbe7e7",
        sidebar: "#0e2b30",
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
