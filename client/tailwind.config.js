/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#2b6777",
          secondary: "#52ab98",
          muted: "#c8d8e4",
          surface: "#ffffff",
          background: "#f2f2f2",
        },
      },
    },
  },
  plugins: [],
};
