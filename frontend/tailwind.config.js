/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefcf6',
          100: '#d6f5e6',
          200: '#aeeacd',
          300: '#7ad9ae',
          400: '#48c28c',
          500: '#26a873',
          600: '#18885d',
          700: '#146d4c',
          800: '#13573e',
          900: '#114735',
        },
        ink: {
          900: '#0f172a',
          800: '#1e2937',
          700: '#2b3647',
          600: '#3a4759',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
