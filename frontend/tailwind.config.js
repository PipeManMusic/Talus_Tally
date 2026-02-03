/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: "#121212",
          light: "#1e1e1e",
          selection: "#2d2d2d",
        },
        fg: {
          primary: "#e0e0e0",
          secondary: "#b0b0b0",
          disabled: "#333333",
        },
        accent: {
          primary: "#D94E1F",
          hover: "#FF6B3B",
        },
        border: {
          DEFAULT: "#333333",
          focus: "#D94E1F",
        },
        status: {
          success: "#28a745",
          warning: "#ffc107",
          danger: "#dc3545",
        },
      },
      fontFamily: {
        display: ["Michroma", "Segoe UI", "Arial", "sans-serif"],
        body: ["Segoe UI", "Arial", "sans-serif"],
      },
      fontSize: {
        xs: "0.67rem",
        sm: "0.75rem",
        base: "0.83rem",
        lg: "1rem",
        xl: "1.17rem",
        "2xl": "1.33rem",
      },
      spacing: {
        titlebar: "40px",
        menubar: "28px",
        toolbar: "36px",
      },
    },
  },
  plugins: [],
}

