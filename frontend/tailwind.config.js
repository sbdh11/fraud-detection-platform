/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070a12",
          900: "#0b0f1a",
          850: "#0f1526",
          800: "#141b30",
          700: "#1c2540",
          600: "#27324f",
        },
        brand: {
          400: "#5eead4",
          500: "#2dd4bf",
          600: "#14b8a6",
        },
        danger: { 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48" },
        warn: { 400: "#fbbf24", 500: "#f59e0b" },
        ok: { 400: "#4ade80", 500: "#22c55e" },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(45,212,191,0.12), 0 12px 40px -12px rgba(45,212,191,0.18)",
      },
    },
  },
  plugins: [],
};
