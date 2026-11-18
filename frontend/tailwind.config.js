/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8f3', 100: '#d6efe1', 200: '#b0dfc5', 300: '#7ec9a3',
          400: '#4aac7d', 500: '#278f60', 600: '#1b724c', 700: '#185b3e',
          800: '#164934', 900: '#133c2c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)',
      },
    },
  },
  plugins: [],
}
