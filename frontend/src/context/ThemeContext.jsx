import { createContext, useContext, useEffect, useState } from 'react';

export const THEMES = {
  amber: {
    name: 'Amber Ink',
    ink: '#14213D', inkLight: '#2A3F63', accent: '#E3A008', accentSoft: '#FDF3D9',
    canvas: '#F6F5F1', line: '#E2E0D8', good: '#2F855A', warn: '#C05621',
  },
  violet: {
    name: 'Violet Dusk',
    ink: '#2A1B4D', inkLight: '#402A6E', accent: '#A855F7', accentSoft: '#F3E8FF',
    canvas: '#F8F6FC', line: '#E9E2F5', good: '#2F855A', warn: '#C05621',
  },
  emerald: {
    name: 'Emerald Slate',
    ink: '#0F2E24', inkLight: '#1B4736', accent: '#10B981', accentSoft: '#D1FAE5',
    canvas: '#F4F9F7', line: '#DCEAE4', good: '#2F855A', warn: '#C05621',
  },
  rose: {
    name: 'Rose Clay',
    ink: '#3B1420', inkLight: '#54202F', accent: '#F43F5E', accentSoft: '#FFE4E8',
    canvas: '#FDF6F7', line: '#F3DEE1', good: '#2F855A', warn: '#C05621',
  },
  ocean: {
    name: 'Ocean Blue',
    ink: '#0B2545', inkLight: '#153a68', accent: '#3B82F6', accentSoft: '#DBEAFE',
    canvas: '#F4F8FC', line: '#DCE7F3', good: '#2F855A', warn: '#C05621',
  },
};

const ThemeContext = createContext(null);

function applyTheme(key) {
  const t = THEMES[key] || THEMES.amber;
  const root = document.documentElement.style;
  root.setProperty('--color-ink', t.ink);
  root.setProperty('--color-ink-light', t.inkLight);
  root.setProperty('--color-amber', t.accent);
  root.setProperty('--color-amber-soft', t.accentSoft);
  root.setProperty('--color-canvas', t.canvas);
  root.setProperty('--color-line', t.line);
  root.setProperty('--color-good', t.good);
  root.setProperty('--color-warn', t.warn);
}

function applyDark(on) {
  document.documentElement.classList.toggle('dark-mode', on);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('cd_theme') || 'amber');
  const [dark, setDarkState] = useState(() => localStorage.getItem('cd_dark') === '1');

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyDark(dark); }, [dark]);

  const setTheme = (key) => {
    localStorage.setItem('cd_theme', key);
    setThemeState(key);
  };

  const setDark = (on) => {
    localStorage.setItem('cd_dark', on ? '1' : '0');
    setDarkState(on);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, dark, setDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
