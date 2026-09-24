import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        titanium: {
          950: "#0b0e14",
          900: "#10151f",
          850: "#151b28",
          800: "#1a2233",
          700: "#243048",
          600: "#324365",
        },
        f1: {
          red: "#E10600",
          yellow: "#FFF500",
          green: "#00D2BE",
          redbull: "#3671C6",
          ferrari: "#E8002D",
          mercedes: "#27F4D2",
          mclaren: "#FF8000",
          aston: "#229971",
          alpine: "#0093CC",
          williams: "#64C4FF",
          rb: "#6692FF",
          sauber: "#52E252",
          haas: "#B6BABD",
        },
        tyre: {
          soft: "#FF1801",
          medium: "#FFC903",
          hard: "#FFFFFF",
          intermediate: "#43B02A",
          wet: "#00A3E0",
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
        neon: "0 0 15px rgba(39, 244, 210, 0.4)",
        "neon-red": "0 0 15px rgba(232, 0, 45, 0.4)",
        "neon-orange": "0 0 15px rgba(255, 128, 0, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;

