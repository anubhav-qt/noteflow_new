import React, { createContext, useState, useContext, useEffect } from 'react';

// Define the themes with multiple gradient options
const THEMES = {
  light: 'light',
  dark: 'dark'
};

// Keep only Floating Shapes and comment out other themes
const LANDING_THEMES = {
  floatingShapes: {
    name: 'Floating Shapes',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-floating-shapes"
  },
  /* 
  cosmicStars: {
    name: 'Cosmic Stars',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-cosmic-stars"
  },
  interactiveGrid: {
    name: 'Interactive Grid',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-interactive-grid"
  },
  flowingWaves: {
    name: 'Flowing Waves',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-flowing-waves"
  },
  digitalRain: {
    name: 'Digital Rain',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-digital-rain"
  },
  glowingParticles: {
    name: 'Glowing Particles',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-glowing-particles"
  },
  neonGrid: {
    name: 'Neon Grid',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-neon-grid"
  },
  magicDust: {
    name: 'Magic Dust',
    style: {
      background: "#0F172A",
      animation: "none"
    },
    textColor: "text-white",
    className: "landing-magic-dust"
  }
  */
};

// Create the context
const ThemeContext = createContext();

// Custom hook to use the theme context
export const useTheme = () => {
  return useContext(ThemeContext);
};

// Theme provider component
export const ThemeProvider = ({ children }) => {
  // Get stored theme from localStorage or use default
  const getStoredTheme = () => {
    const storedTheme = localStorage.getItem('theme');
    return storedTheme === THEMES.dark ? THEMES.dark : THEMES.light;
  };

  // Always return floatingShapes as the landing theme
  const getStoredLandingTheme = () => {
    return 'floatingShapes';
    // Comment out the original code that checks localStorage
    // const storedTheme = localStorage.getItem('landingTheme');
    // return Object.keys(LANDING_THEMES).includes(storedTheme) ? storedTheme : 'floatingShapes';
  };

  const [isDarkMode, setIsDarkMode] = useState(() => getStoredTheme() === THEMES.dark);
  const [currentLandingTheme, setCurrentLandingTheme] = useState('floatingShapes');

  // Toggle between light and dark mode
  const toggleTheme = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  // Set a specific landing theme - but only allowing floatingShapes
  const setLandingTheme = (theme) => {
    // Always set to floatingShapes regardless of input
    console.log(`Theme selection disabled - using 'floatingShapes' only`);
    setCurrentLandingTheme('floatingShapes');
    localStorage.setItem('landingTheme', 'floatingShapes');
    /* Original code that allowed changing themes
    if (Object.keys(LANDING_THEMES).includes(theme)) {
      console.log(`Setting landing theme to: ${theme}`);
      setCurrentLandingTheme(theme);
      localStorage.setItem('landingTheme', theme);
    } else {
      console.warn(`Invalid theme name: ${theme}. Available themes:`, Object.keys(LANDING_THEMES));
    }
    */
  };

  // Update localStorage and body class when theme changes
  useEffect(() => {
    const newTheme = isDarkMode ? THEMES.dark : THEMES.light;
    localStorage.setItem('theme', newTheme);
    
    if (isDarkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);

  // The context value
  const value = {
    isDarkMode,
    toggleTheme,
    currentLandingTheme,
    setLandingTheme,
    landingThemes: LANDING_THEMES
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
