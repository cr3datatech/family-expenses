import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        snap: {
          50: "#F0FDF4",
          100: "#DCFCE7",
          200: "#BBF7D0",
          300: "#86EFAC",
          500: "#22C55E",
          600: "#16A34A",
          800: "#166534",
        },
        skin: {
          primary: "#1A2E1A",
          secondary: "#6B7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;
