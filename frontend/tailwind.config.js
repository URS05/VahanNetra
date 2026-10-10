/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        room: {
          bg: "#050507",
          panel: "#121214",
          ink: "#f5f5f5",
          muted: "#8e8e8e",
          line: "rgba(255,255,255,0.12)",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', "system-ui", "sans-serif"],
        display: ['"BubbledotICG-FinePos"', '"Geist Pixel Circle"', "monospace"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        nav: "0 4px 14px rgba(0, 0, 0, 0.16)",
        glow: "0 0 0 1px rgba(255,255,255,0.15), 0 0 22px rgba(255,255,255,0.32), 0 0 44px rgba(255,255,255,0.12)",
      },
      borderRadius: {
        pill: "999px",
      },
    },
  },
  plugins: [],
};
