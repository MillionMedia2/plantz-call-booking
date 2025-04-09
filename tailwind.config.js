/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hubbot: {
          dark: '#33475b',
          light: '#f5f8fa',
          hover: '#425b76'
        }
      },
      boxShadow: {
        hubbot: '0 2px 8px rgba(0, 0, 0, 0.08)'
      },
      borderRadius: {
        hubbot: '0.5rem'
      }
    },
  },
  plugins: [],
} 