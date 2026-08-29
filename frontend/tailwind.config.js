/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: "#111111",
          800: "#1A1A1A",
          700: "#232323",
          600: "#2E2E2E",
          500: "#3D3D3D",
        },
        bone: {
          DEFAULT: "#F5F2EA",
          soft: "#FAF8F3",
        },
        mist: {
          DEFAULT: "#E8E5DD",
          dark: "#D8D4C8",
        },
        signal: {
          orange: "#FF6B35",
          mint: "#34D399",
          amber: "#F4B942",
          red: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(17,17,17,0.04)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 },
        },
        sweep: {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "200% 0%" },
        },
        rise: {
          "0%": { opacity: 0, transform: "translateY(4px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
        sweep: "sweep 2.2s linear infinite",
        rise: "rise 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
