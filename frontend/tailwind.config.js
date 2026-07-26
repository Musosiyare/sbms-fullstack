/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // A deep wine/garnet, not the main system's navy — deliberately
        // distinct so staff can tell which of the two sibling systems
        // they're in at a glance, while every component still follows the
        // same structural grammar (cards, radii, spacing) as the main app.
        brand: {
          50: "#fbeef0",
          100: "#f6d9de",
          200: "#e9adba",
          400: "#b23a56",
          500: "#7f1d3a",
          600: "#67172f",
          700: "#4f1224",
        },
        manager: "#2b3a67", // same as the main system
        dod: "#7f1d3a", // Dean of Discipline — the top disciplinary authority
        officer: "#b45309", // Disciplinary Officer (patron/matron) — amber, "on patrol"
        reporter: "#0d9488", // teacher/manager submitting a report — same teal the main system uses for teachers
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Roboto",
          "sans-serif",
        ],
        display: ["Playfair Display", "Georgia", "serif"],
        // "Amélina Colette" isn't distributed on a public CDN (1001fonts,
        // personal-use only), so it's listed first here purely so that if
        // this school later buys/self-hosts a licensed copy and adds an
        // @font-face rule for it, it takes over automatically with no code
        // changes. Caveat (Google Fonts, free for commercial use) is the
        // closest available stand-in in the meantime — a bold, warm
        // handwritten face for the same "personal touch" feel.
        accent: ["\"Amélina Colette\"", "Caveat", "cursive"],
      },
    },
  },
  plugins: [],
};
