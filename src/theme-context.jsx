import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Site-wide theme (light/dark) as a context so ANY component — header,
// pages, panels — can read and flip it. Persists to `malTheme`.
export const ThemeContext = createContext({ theme: 'light', isDark: false, toggle: () => {}, setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('malTheme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    try { localStorage.setItem('malTheme', theme); } catch { /* ignore */ }
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState((current) => {
    if (typeof next === 'function') return next(current);
    return next === 'dark' ? 'dark' : 'light';
  }), []);

  const toggle = useCallback(() => setThemeState(
    (current) => (current === 'dark' ? 'light' : 'dark'),
  ), []);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    toggle,
    setTheme,
  }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
