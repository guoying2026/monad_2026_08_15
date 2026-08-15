import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        card: "var(--card)",
        line: "var(--line)",
        chip: "var(--chip)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-fg": "var(--accent-fg)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "var(--font-sc)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
