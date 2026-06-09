import { createContext, useContext, useState, useEffect } from 'react';
import { getTheme, DEFAULT_THEME } from '../config/themes.js';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(DEFAULT_THEME);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('moca-theme');
    if (savedTheme) {
      setCurrentTheme(savedTheme);
    }
    setIsLoaded(true);
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

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId);
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, changeTheme, isLoaded }}>
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