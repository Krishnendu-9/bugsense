import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './contexts.js';
import {
  applyTheme,
  hasStoredTheme,
  persistTheme,
  resolveInitialTheme,
} from '../utils/theme.js';

/**
 * Holds the active theme and keeps <html data-theme> in step with it.
 *
 * The initial value comes from the same resolution the inline script in
 * index.html already ran, so mounting does not change the painted theme.
 *
 * data-theme is written in the handler that changes the theme rather than in
 * an effect, which matters for correctness and not just for render counts:
 * consumers that read token *values* instead of classes (useThemeTokens, the
 * Fabric canvas) resolve them during render, and effects run after render. If
 * the attribute were only applied in an effect, those consumers would read the
 * previous palette on the render that switched themes.
 */
export default function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolveInitialTheme);

  // A safety net rather than the main path: keeps the attribute correct if it
  // ever drifts from React state. Deliberately does not set state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const selectTheme = useCallback((next) => {
    applyTheme(next);
    persistTheme(next);
    setTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    // Read through the setter so two quick clicks cannot both act on the same
    // stale value, and apply the attribute from inside it for the same reason.
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  // Follow the system while the user has not pinned a choice of their own.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => {
      if (hasStoredTheme()) return;
      const next = event.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme: selectTheme, toggleTheme }),
    [theme, selectTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
