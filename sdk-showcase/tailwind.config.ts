import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Kumo semantic color tokens
        kumo: {
          // Surfaces
          base: 'var(--kumo-bg-base)',
          elevated: 'var(--kumo-bg-elevated)',
          recessed: 'var(--kumo-bg-recessed)',
          // Text
          default: 'var(--kumo-text-default)',
          secondary: 'var(--kumo-text-secondary)',
          muted: 'var(--kumo-text-muted)',
          link: 'var(--kumo-text-link)',
          // Borders
          line: 'var(--kumo-border-line)',
          focus: 'var(--kumo-border-focus)',
          // Accent
          accent: 'var(--kumo-accent)',
          'accent-hover': 'var(--kumo-accent-hover)',
        },
        // Container status colors
        status: {
          new: '#6b7280',        // gray
          'on-ship': '#3b82f6',  // blue
          available: '#22c55e', // green
          'not-available': '#eab308', // yellow
          grounded: '#f97316',  // orange
          'awaiting-inland': '#a855f7', // purple
          'on-rail': '#6366f1', // indigo
          'picked-up': '#14b8a6', // teal
          'off-dock': '#06b6d4', // cyan
          delivered: '#10b981', // emerald
          'empty-returned': '#9ca3af', // gray
        },
      },
    },
  },
  plugins: [],
};

export default config;
