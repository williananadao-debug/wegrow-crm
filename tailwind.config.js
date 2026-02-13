/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mapeando as tuas variáveis do globals.css para o Tailwind
        'wg-bg': '#07131a',
        'wg-green': '#22C55E',
        'wg-green-soft': '#4ADE80',
        'wg-yellow': '#FACC15',
        'wg-red': '#EF4444',
        'wg-dark': '#0F172A', // O "Preto Técnico" do teu Brand Kit
      },
      borderRadius: {
        'wg': '22px',
      },
      fontFamily: {
        // Definindo a Inter como padrão
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};