/*
 * CommonJS on purpose. As an ES module this config is loaded through Node's
 * native require(esm), whose cache Tailwind v3 cannot clear, so the dev server
 * kept compiling against the config it started with: a new colour key produced
 * no CSS rule until the server was restarted. As CommonJS, Tailwind reloads it
 * on every edit. Measured both ways before switching -- see the step 3 notes.
 */
const animate = require('tailwindcss-animate');

/**
 * Each colour resolves to rgb(var(--token) / <alpha-value>) so that the
 * opacity modifiers Tailwind generates (bg-surface/70, border-border/30) keep
 * working while the channel values themselves come from index.css and switch
 * with [data-theme]. Nothing in here is a literal.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces and structure
        bg: token('bg'),
        surface: token('surface'),
        canvas: token('canvas'),
        border: token('border'),
        hairline: token('hairline'),
        track: token('track'),

        /*
         * Foreground. The token is --text, but Tailwind cannot expose a colour
         * key named `text`: the candidate `text-text` collides with the
         * text-<size> namespace and is silently dropped, so the class would
         * compile to nothing. `fg` is the class name; the variable keeps the
         * agreed name. (bg-bg and border-border are unaffected -- those
         * namespaces are not shared with another utility.)
         */
        fg: token('text'),
        muted: token('muted'),
        subtle: token('subtle'),

        // Accent and the single primary action
        accent: token('accent'),
        'accent-dim': token('accent-dim'),
        'on-accent': token('on-accent'),
        'primary-bg': token('primary-bg'),
        'primary-fg': token('primary-fg'),

        // Destructive actions and form errors. Not in the agreed token list:
        // added because ~40 call sites were using priority-high for this, and
        // priority-high is now orange rather than red.
        danger: token('danger'),

        // Semantic status and priority. Medium and low priority deliberately
        // have no colour of their own -- they render in muted.
        'status-open': token('status-open'),
        'status-progress': token('status-progress'),
        // Graphics only (squares, chart segments) -- see index.css.
        'status-progress-mark': token('status-progress-mark'),
        'status-resolved': token('status-resolved'),
        'priority-critical': token('priority-critical'),
        'priority-high': token('priority-high'),
        'priority-medium': token('muted'),
        'priority-low': token('muted'),

        /*
         * Deprecated aliases, kept only so the component sweep can be a
         * separate reviewable step instead of landing inside the token change.
         * Each one points at its replacement, so the new palette takes effect
         * immediately; the names go away as the components are rewritten.
         *
         *   text-base           -> text        (113 call sites)
         *   background          -> canvas      (6)
         *   primary / secondary -> accent      (98 -- these meant "the accent")
         *   status-in-progress  -> status-progress (4)
         *   status-closed       -> muted       (4, closed is now colourless)
         */
        'text-base': token('text'),
        background: token('canvas'),
        'surface-elevated': token('surface'),
        'border-light': token('hairline'),
        primary: token('accent'),
        'primary-hover': token('accent'),
        secondary: token('accent'),
        'status-in-progress': token('status-progress'),
        'status-closed': token('muted'),
      },
      // IBM Plex, self-hosted from @fontsource (see main.jsx). Sans is the
      // interface; Mono is for data only -- counts, durations, timestamps,
      // identifiers, the Ctrl-K hint, code -- never for decoration.
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        // Flat by design: one elevation step, theme-aware, no coloured glow.
        card: '0 1px 2px 0 rgb(var(--shadow) / var(--shadow-opacity))',
        popover: '0 8px 24px -8px rgb(var(--shadow) / var(--shadow-opacity))',
      },
    },
  },
  plugins: [animate],
};
