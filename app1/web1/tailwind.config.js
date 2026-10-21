/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF9F5',
          100: '#FFF0E6',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F47738',
          600: '#F47738',
          700: '#D95D24',
          800: '#C2410C',
          900: '#7C2D12',
        },
        primary: {
          DEFAULT: '#F47738',
          hover: '#D95D24',
          light: '#FFF0E6',
          bg: '#FFF9F5',
        },
        warm: {
          bg: '#FFF9F5',
          surface: '#FFF0E6',
          border: '#F0E2D8',
          text: '#242424',
          muted: '#6B7280',
        },
      },
    },
  },
  plugins: [],
};
