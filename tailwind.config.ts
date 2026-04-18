import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#041627',
        'primary-container': '#1A2B3C',
        surface: '#F7FAFC',
        'surface-lowest': '#FFFFFF',
        'surface-low': '#F0F4F8',
        'surface-base': '#E8EDF2',
        'surface-high': '#DCE3EA',
        'surface-highest': '#CBD5E0',
        'on-surface': '#181C1E',
        'on-primary': '#FFFFFF',
        error: '#BA1A1A',
        'error-container': '#FFDAD6',
        healthy: '#10B981',
        drift: '#F97316',
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: { lg: '0.5rem' },
      boxShadow: { ambient: '0 20px 40px rgba(4,22,39,0.06)' },
      backgroundImage: {
        'signature-gradient': 'linear-gradient(135deg, #041627, #1A2B3C)',
      },
    },
  },
  plugins: [],
}

export default config
