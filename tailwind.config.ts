import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Umbra brand palette — teal-green, single source of truth.
        // Replaces the Veil-era violet (#3e13af). The 50→900 ramp lets
        // components use `bg-brand-50`, `text-brand-700` etc. instead of
        // hardcoded `bg-purple-*`.
        brand: {
          50: "#f0f7f4",
          100: "#dcebe4",
          200: "#bcd9cd",
          300: "#8fc0aa",
          400: "#5fa288",
          500: "#458077",
          600: "#37685e",
          700: "#2d544c",
          800: "#26433d",
          900: "#21383a",
          // Named aliases preserved for back-compat with existing
          // `bg-brand-primary` / `text-brand-primary-light` etc. usages.
          primary: "#458077",
          "primary-light": "#5fa288",
          "primary-dark": "#2d544c",
          accent: "#1A9F6F",
          "accent-light": "#2bbd86",
        },
        // `veil.redaction-black` stays — it's the redacted-rectangle
        // colour, not a brand colour. The Veil-era `veil.accent` (#7c3aed)
        // was orphaned (no live references) and is dropped.
        veil: {
          "redaction-black": "#1a1a1a",
        },
        surface: {
          bg: "#faf9f7",
          card: "#ffffff",
          hover: "#f0f7f4", // matches brand-50 — was #F3F0FA (purple tint)
          elevated: "#ffffff",
        },
        txt: {
          primary: "#1a1523",
          secondary: "#4a4458",
          "on-primary": "#ffffff",
        },
        confidence: {
          high: "#1A9F6F",
          medium: "#f59e0b",
          low: "#ef4444",
        },
        status: {
          draft: "#6B7280",
          "in-review": "#3B82F6",
          approved: "#16A34A",
          rejected: "#DC2626",
          released: "#458077", // matches new brand-primary
        },
        deadline: {
          safe: "#16A34A",
          warning: "#D97706",
          urgent: "#DC2626",
        },
        border: {
          DEFAULT: "#e0eae6", // subtle teal-tinted neutral — was #e8e4f0
          focus: "#458077", // matches new brand-primary
        },
      },
      fontFamily: {
        heading: ["var(--font-playfair)", "Playfair Display", "serif"],
        body: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        input: "4px",
        card: "8px",
        modal: "12px",
        badge: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
