/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dota 2 inspired color palette
        'radiant': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        'dire': {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        'dota': {
          'bg': '#1a1a2e',
          'surface': '#16213e',
          'primary': '#0f3460',
          'accent': '#e94560',
          'gold': '#ffd700',
        },
      },
      fontFamily: {
        'dota': ['Reaver', 'Radiance', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
