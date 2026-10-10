/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tac: {
          bg: "#0d0d0d",
          surface: "#171717",
          panel: "#171717",
          inner: "#262626",
          border: "#262626",
          "border-bright": "#383838",
          accent: "#f97316",
          "accent-dim": "#ea580c",
          "accent-glow": "rgba(249,115,22,0.25)",
          text: "#ffffff",
          "text-dim": "#a3a3a3",
          "text-muted": "#737373",
          green: "#22c55e",
          red: "#ef4444",
          yellow: "#eab308",
          amber: "#f59e0b",
          blue: "#3b82f6",
          critical: "#ef4444",
        },
        room: {
          bg: "#0d0d0d",
          panel: "#171717",
          ink: "#ffffff",
          muted: "#a3a3a3",
          line: "#262626",
        },
      },
      fontFamily: {
        sans: ['"JetBrains Mono"', '"Share Tech Mono"', "monospace"],
        display: ['"JetBrains Mono"', '"Share Tech Mono"', "monospace"],
        mono: ['"JetBrains Mono"', '"Share Tech Mono"', "monospace"],
      },
      boxShadow: {
        nav: "0 4px 14px rgba(0, 0, 0, 0.4)",
        glow: "0 0 0 1px rgba(249,115,22,0.2), 0 0 16px rgba(249,115,22,0.15)",
        "glow-accent": "0 0 12px rgba(249,115,22,0.35)",
      },
      borderRadius: {
        pill: "999px",
      },
      animation: {
        "radar-sweep": "radar-sweep 4s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
