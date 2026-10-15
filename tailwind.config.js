/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Se arman con variables (`status-${estado}`), así que Tailwind no las ve en el código y las borraría
  safelist: ['status-pending', 'status-confirmed', 'status-completed', 'status-cancelled', 'status-no-show'],
  theme: {
    extend: {
      // El diseño usa white/8 y white/12 (bordes suaves); sin esto Tailwind los ignora y el borde sale blanco
      opacity: { 8: '0.08', 12: '0.12' },
      // Paleta del manual de identidad de Salón Hermanos
      colors: {
        gold: {
          DEFAULT: '#D9AD50',
          50: '#FBF4E4',
          100: '#F1DCA8',
          200: '#E6C27A',
          300: '#D9AD50',
          400: '#B58C3C',
          500: '#8C6A2A',
          600: '#6B501F',
        },
        // Negro carbón: fondos y contornos
        dark: {
          DEFAULT: '#111111',
          50: '#222222',
          100: '#1A1A1A',
          200: '#161616',
        },
        // Marfil: texto principal y fondos cálidos
        ivory: { DEFAULT: '#F5F0E6', muted: '#D5D0C7' },
        // Rojo y azul del poste de barbería: solo acentos pequeños
        barber: { red: '#D71920', blue: '#174A9C' },
        bronze: '#6B501F',
      },
      fontFamily: {
        // Títulos: serif robusta como «HERMANOS»
        serif: ['"Roboto Slab"', 'Georgia', 'serif'],
        display: ['"Alfa Slab One"','"Roboto Slab"', 'Georgia', 'serif'],
        // Cursiva de «Salón»
        script: ['Lobster', 'cursive'],
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
        mono: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #B58C3C 0%, #E6C27A 50%, #B58C3C 100%)',
        'dark-radial': 'radial-gradient(ellipse at center, #1A1A1A 0%, #111111 70%)',
        // Franjas del poste de barbería
        'barber-pole': 'repeating-linear-gradient(-45deg, #D71920 0 10px, #F5F0E6 10px 20px, #174A9C 20px 30px, #F5F0E6 30px 40px)',
      },
      animation: {
        'shimmer': 'shimmer 2.5s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        'bounce-slow': 'bounce 2s infinite',
        'spin-slow': 'spin 8s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(217, 173, 80, 0.4)' },
          '50%': { boxShadow: '0 0 0 20px rgba(217, 173, 80, 0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
