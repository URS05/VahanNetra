/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        room: {
          bg: "#070b10",
          panel: "#10161d",
          border: "#2a3a4c",
          ink: "#f4f7fb",
          muted: "#a8b6c4",
        },
        alert: "#ff4d4d",
      },
      fontSize: {
        body: ["14px", "1.45"],
      },
    },
  },
  plugins: [],
};
