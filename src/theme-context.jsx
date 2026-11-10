import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Site-wide theme (light/dark) as a context so ANY component — header,
// pages, panels — can read and flip it.
// Dark is the default for everyone. The choice is stored ONLY when a person flips the switch (key `anitale.theme`),
// so a first visit never counts as a choice. The old key `malTheme` is ignored on purpose: it was written on every
// visit (even when nobody chose), so it cannot tell a real "light" choice from the old default.
const KEY = 'anitale.theme';
export const ThemeContext = createContext({ theme: 'dark', isDark: true, toggle: () => {}, setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

const remember = (value) => { try { localStorage.setItem(KEY, value); } catch { /* private mode */ } };

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState((current) => {
    const value = typeof next === 'function' ? next(current) : next;
    const chosen = value === 'light' ? 'light' : 'dark';
    remember(chosen);
    return chosen;
  }), []);

  const toggle = useCallback(() => setThemeState((current) => {
    const chosen = current === 'dark' ? 'light' : 'dark';
    remember(chosen);
    return chosen;
  }), []);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    toggle,
    setTheme,
  }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
