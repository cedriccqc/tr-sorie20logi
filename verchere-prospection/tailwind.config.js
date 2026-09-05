/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette Verchere
        marine: {
          50: "#f2f5f9",
          100: "#e2e9f2",
          200: "#c6d3e6",
          600: "#2c4a72",
          700: "#20395a",
          800: "#16283f",
          900: "#0e1b2c",
        },
        laiton: {
          400: "#c9a227",
          500: "#b28c1c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
