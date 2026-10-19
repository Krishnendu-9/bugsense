/*
 * Theme resolution and the bridge between CSS tokens and JavaScript.
 *
 * Tailwind classes cover almost everything, but three consumers take colours
 * as values rather than classes: Recharts (props such as `stroke` and `fill`),
 * the Fabric annotation canvas, and the react-hot-toast style object. Those
 * read tokens through readToken() / readTokens() here so there is still one
 * source of truth in index.css.
 */

export const THEMES = ['light', 'dark'];
export const STORAGE_KEY = 'bugsense:theme';

/**
 * The theme to apply on load: an explicit earlier choice if there is one,
 * otherwise the operating system preference.
 *
 * Mirrors the inline script in index.html, which runs the same resolution
 * before first paint. Keep the two in step.
 */
export const resolveInitialTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(stored)) return stored;
  } catch {
    // Private browsing and blocked site data both throw on access; fall
    // through to the system preference.
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

/** Whether the user has pinned a theme, as opposed to following the system. */
export const hasStoredTheme = () => {
  try {
    return THEMES.includes(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
};

export const applyTheme = (theme) => {
  const root = document.documentElement;
  root.dataset.theme = theme;

  // Keep the browser chrome (mobile address bar, form controls) in step with
  // the palette. The value has to be a real colour, so it comes from the token.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', readToken('canvas'));
};

export const persistTheme = (theme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not being able to remember the choice is not worth failing the toggle.
  }
};

/**
 * Reads one design token as a usable CSS colour string.
 *
 * Tokens are stored as bare "R G B" channels (see index.css) so Tailwind can
 * apply opacity modifiers, which means a raw getPropertyValue() is not a valid
 * colour on its own and has to be wrapped here.
 *
 * @param {string} name  token name without the leading dashes, e.g. 'accent'
 * @param {number} [alpha]  0-1; omitted means fully opaque
 */
export const readToken = (name, alpha) => {
  const channels = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();

  // jsdom resolves custom properties, but a token that does not exist returns
  // an empty string, which would silently become `rgb()` and paint nothing.
  if (!channels) {
    if (import.meta.env?.DEV) console.warn(`[theme] unknown token --${name}`);
    return 'transparent';
  }

  return alpha === undefined ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
};

/** Reads several tokens at once: readTokens(['accent','muted']) -> { accent, muted } */
export const readTokens = (names) =>
  Object.fromEntries(names.map((name) => [name, readToken(name)]));
