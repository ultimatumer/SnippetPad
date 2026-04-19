/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ph: {
          bg:       "#1d1f27",
          surface:  "#23262f",
          elevated: "#2c2f3a",
          border:   "rgba(255,255,255,0.08)",
          accent:   "#f54e00",
          "accent-hover": "#e04400",
          "accent-subtle": "rgba(245,78,0,0.15)",
          text:     "#f9f9f9",
          muted:    "#9aa1b9",
          faint:    "#545b72",
          success:  "#2cb67d",
          danger:   "#e03131",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
