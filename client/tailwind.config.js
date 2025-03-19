/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#3B82F6', // blue-500
          DEFAULT: '#2563EB', // blue-600
          dark: '#1D4ED8', // blue-700
        },
        secondary: {
          light: '#10B981', // emerald-500
          DEFAULT: '#059669', // emerald-600
          dark: '#047857', // emerald-700
        },
        // Additional dark mode specific color
        'gray-750': '#2c333d',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 1s ease-in-out',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
        },
      },
    },
  },
  plugins: [],
  safelist: [
    'bg-primary',
    'text-primary',
    'bg-primary-dark',
    'hover:bg-primary-dark',
    'focus:ring-primary',
    'text-primary-dark',
    'hover:text-primary-dark',
    'dark:bg-gray-800',
    'dark:text-white'
  ]
}
