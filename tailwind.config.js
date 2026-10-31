/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08080B',
          900: '#0B0B0F',
          850: '#101017',
          800: '#14141A',
          700: '#1C1C22',
          600: '#26262E',
          500: '#33333D',
        },
        cloud: {
          100: '#F5F5F7',
          300: '#D4D4DA',
          400: '#A1A1AA',
          500: '#6B6B76',
        },
        ncm: {
          DEFAULT: '#EC4141',
          light: '#FF5C5C',
          deep: '#B31E1E',
        },
      },
      fontFamily: {
        sans: [
          '"Source Han Sans SC"',
          '"Noto Sans CJK SC"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        glow: '0 0 60px -12px rgba(236, 65, 65, 0.45)',
        glass: '0 24px 60px -24px rgba(0, 0, 0, 0.9)',
      },
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.04)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'bar-dance': {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 20s linear infinite',
        breathe: 'breathe 6s ease-in-out infinite',
        'fade-up': 'fade-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'bar-dance': 'bar-dance 900ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
