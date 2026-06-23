/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // gold 色阶 (agentX exact)
        gold: {
          50:  '#fdf8e7',
          100: '#f9edb8',
          200: '#f5d76e',
          300: '#e8c547',
          400: '#d4a827',
          500: '#c9a227',
          600: '#a8841e',
          700: '#866717',
          800: '#654b10',
          900: '#43300a',
        },
        // dark 色阶 (agentX exact)
        dark: {
          50:  '#2a2a3a',
          100: '#222230',
          200: '#1a1a26',
          300: '#14141e',
          400: '#12121a',
          500: '#0e0e16',
          600: '#0c0c12',
          700: '#0a0a10',
          800: '#08080d',
          900: '#050508',
        },
      },
      animation: {
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        'flow-dash':  'flow-dash 1s linear infinite',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201,162,39,0.4)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(201,162,39,0)' },
        },
        'flow-dash': {
          to: { strokeDashoffset: '-20' },
        },
      },
    },
  },
  plugins: [],
}
