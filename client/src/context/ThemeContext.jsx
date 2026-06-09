import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTheme, DEFAULT_THEME } from '../config/themes.js';

const ThemeContext = createContext();

const COLOR_MODE_STORAGE_KEY = 'moca_color_mode';
const VALID_COLOR_MODES = ['system', 'light', 'dark'];

/**
 * Read the current effective color scheme (light or dark) based on
 * the colorMode setting. 'system' resolves to the OS preference.
 */
function getSystemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveEffectiveColorMode(colorMode) {
  if (colorMode === 'dark') return 'dark';
  if (colorMode === 'light') return 'light';
  return getSystemPrefersDark() ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(DEFAULT_THEME);
  // colorMode: 'system' | 'light' | 'dark'
  const [colorMode, setColorMode] = useState('system');
  // systemPrefersDark: live state of OS preference (only meaningful when colorMode === 'system')
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load theme + colorMode from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('moca-theme');
    if (savedTheme) {
      setCurrentTheme(savedTheme);
    }
    const savedColorMode = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (savedColorMode && VALID_COLOR_MODES.includes(savedColorMode)) {
      setColorMode(savedColorMode);
    }
    setIsLoaded(true);
  }, []);

  // Listen to OS color-scheme changes — always (cheap) so we can flip
  // the data-color-mode attribute on the fly when the user is on 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemPrefersDark(e.matches);
    // Older Safari uses addListener; modern uses addEventListener
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    } else if (mql.addListener) {
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
  }, []);

  // Apply theme CSS variables whenever theme changes
  useEffect(() => {
    if (!isLoaded) return;
    
    const theme = getTheme(currentTheme);
    const root = document.documentElement;
    
    // Apply colors
    Object.entries(theme.colors).forEach(([varName, value]) => {
      root.style.setProperty(varName, value);
    });
    
    // Apply fonts
    Object.entries(theme.fonts).forEach(([varName, value]) => {
      root.style.setProperty(varName, value);
    });
    
    // Apply effects
    Object.entries(theme.effects).forEach(([varName, value]) => {
      root.style.setProperty(varName, value);
    });
    
    // Set data attribute for CSS selectors
    root.setAttribute('data-theme', theme.id);
    
    // Save to localStorage
    localStorage.setItem('moca-theme', currentTheme);
  }, [currentTheme, isLoaded]);

  // Apply data-color-mode attribute on <html> based on colorMode + system pref
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const effective = resolveEffectiveColorMode(colorMode);
    root.setAttribute('data-color-mode', effective);
  }, [colorMode, systemPrefersDark]);

  // Persist colorMode to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
  }, [colorMode, isLoaded]);

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId);
  };

  const changeColorMode = useCallback((mode) => {
    if (!VALID_COLOR_MODES.includes(mode)) return;
    setColorMode(mode);
  }, []);

  const effectiveColorMode = resolveEffectiveColorMode(colorMode);

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        changeTheme,
        colorMode,
        changeColorMode,
        effectiveColorMode,
        systemPrefersDark,
        isLoaded,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
