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
        brand: {
          primary: "#3e13af",
          "primary-light": "#5a3cc4",
          "primary-dark": "#2d0e80",
          accent: "#1A9F6F",
          "accent-light": "#2bbd86",
        },
        veil: {
          accent: "#7c3aed",
          "redaction-black": "#1a1a1a",
        },
        surface: {
          bg: "#faf9f7",
          card: "#ffffff",
          hover: "#F3F0FA",
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
          released: "#3e13af",
        },
        deadline: {
          safe: "#16A34A",
          warning: "#D97706",
          urgent: "#DC2626",
        },
        border: {
          DEFAULT: "#e8e4f0",
          focus: "#3e13af",
        },
      },
      fontFamily: {
        heading: ["Playfair Display", "serif"],
        body: ["DM Sans", "sans-serif"],
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
