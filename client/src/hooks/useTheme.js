import { useContext, useMemo } from 'react';
import { ThemeContext } from '../context/contexts.js';
import { readTokens } from '../utils/theme.js';

export default function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/**
 * Resolves design tokens to colour strings for code that cannot use classes --
 * Recharts props, the Fabric canvas -- and re-resolves them when the theme
 * changes.
 *
 * Safe to call during render: ThemeProvider writes data-theme before the
 * re-render that reports the new theme, so the variables have already switched
 * by the time this reads them.
 *
 * @param {string[]} names  token names without the leading dashes
 * @returns {Record<string, string>} token name -> 'rgb(r g b)'
 */
export function useThemeTokens(names) {
  const { theme } = useTheme();
  const key = names.join(',');
  // `key` stands in for `names`, which is a fresh array on every render, and
  // `theme` is what makes the same token names resolve to different values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readTokens(names), [key, theme]);
}
