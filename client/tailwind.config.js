import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6366F1',
        'primary-hover': '#4F46E5',
        secondary: '#8B5CF6',
        accent: '#06B6D4',
        background: '#090D16',
        surface: '#111827',
        'surface-elevated': '#161F30',
        border: '#1E293B',
        'border-light': 'rgba(255, 255, 255, 0.08)',
        'text-base': '#F8FAFC',
        muted: '#94A3B8',
        'priority-low': '#10B981',
        'priority-medium': '#F59E0B',
        'priority-high': '#EF4444',
        'priority-critical': '#8B5CF6',
        'status-open': '#3B82F6',
        'status-in-progress': '#F59E0B',
        'status-resolved': '#10B981',
        'status-closed': '#64748B',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-primary': '0 0 25px -5px rgba(99, 102, 241, 0.35)',
        'glow-secondary': '0 0 25px -5px rgba(139, 92, 246, 0.35)',
        'glow-accent': '0 0 25px -5px rgba(6, 182, 212, 0.35)',
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.07)',
      },
      backdropBlur: {
        xs: '2px',
        md: '12px',
      },
    },
  },
  plugins: [animate],
};
