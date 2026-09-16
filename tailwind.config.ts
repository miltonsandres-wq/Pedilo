import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        // Marca Pedilo: coral cálido (el hambre, la calidez catracha) — ver
        // Manual de Marca/manual-marca-pedilo.html, sección 03. 600 y 700 son
        // los tonos exactos del manual (Coral / Coral profundo); el resto de
        // la rampa se interpola para tener tintes y sombras consistentes.
        brand: {
          50: "#fff4ef",
          100: "#ffe3d8", // Coral suave — fondos tenues, resaltados
          200: "#fdc7b3",
          300: "#faa485",
          400: "#f87f55",
          500: "#f46e45",
          600: "#f4623a", // Coral — principal: marca, botones, acentos
          700: "#c6421f", // Coral profundo — texto sobre coral claro, estados activos
          800: "#9c341a",
          900: "#742714",
        },
        // Navy/slate del manual (idéntico a la escala "slate" de Tailwind):
        // texto y superficies "chrome" oscuras (sidebar, panel de marca).
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569", // Slate — texto secundario
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a", // Navy — texto principal, fondos oscuros
          950: "#020617",
        },
        libre: {
          bg: "#ecfdf5",
          border: "#a7f3d0",
          text: "#047857",
          dot: "#10b981",
        },
        ocupada: {
          bg: "#fef2f2",
          border: "#fecaca",
          text: "#b91c1c",
          dot: "#ef4444",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(20 23 30 / 0.04), 0 1px 3px 0 rgb(20 23 30 / 0.06)",
        popover: "0 8px 24px -4px rgb(20 23 30 / 0.12), 0 2px 8px -2px rgb(20 23 30 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
