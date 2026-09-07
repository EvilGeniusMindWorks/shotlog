import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand navy / orange from the final logo kit (Sep 2026)
        navy: {
          DEFAULT: '#1C3859',
          50: '#e8edf4',
          100: '#c5d1e4',
          200: '#9fb3d1',
          300: '#7995be',
          400: '#5c7eb0',
          500: '#3f67a2',
          600: '#375a8e',
          700: '#2d4a75',
          800: '#243b5d',
          900: '#1C3859',
        },
        safety: {
          orange: '#EE7A2E',
        },
        compliant: '#38a169',
        warning: '#d69e2e',
        violation: '#e53e3e',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
