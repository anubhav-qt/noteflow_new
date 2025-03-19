import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
// Comment out unused theme selector icons
// import { FiChevronUp, FiChevronDown, FiCheck } from 'react-icons/fi';

function LandingPage() {
  const navigate = useNavigate();
  const { currentLandingTheme, landingThemes } = useTheme();
  // Comment out theme selector state and handlers
  // const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  // Comment out unused refs and states for other themes
  // const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const shapesRef = useRef([]);
  const requestRef = useRef();
  const isFloatingShapesActive = true; // Always true since we're only using floating shapes

  // Animate content in on load
  useEffect(() => {
    setAnimateIn(true);
    
    // Remove other theme initialization code
    /* 
    if (currentLandingTheme === 'glowingParticles' || currentLandingTheme === 'magicDust') {
      initCanvas();
    }
    */
    
    // Only track mouse movement for floating shapes theme
    const container = containerRef.current;
    if (container) {
      const handleMouseMove = (e) => {
        const rect = container.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      };
      
      container.addEventListener('mousemove', handleMouseMove);
      
      return () => {
        container.removeEventListener('mousemove', handleMouseMove);
      };
    }
    
    return () => {
      // Cleanup animations if needed
      /* 
      if (canvasRef.current) {
        cancelAnimationFrame(window.animationFrame);
      }
      */
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);
  
  // Handle floating shapes animation based on mouse position
  useEffect(() => {
    // Initialize shapes with their original positions if not already done
    if (shapesRef.current.length === 0 && containerRef.current) {
      const container = containerRef.current;
      const shapes = container.querySelectorAll('.shape');
      
      shapes.forEach(shape => {
        const rect = shape.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Store original position
        const originalX = rect.left - containerRect.left + rect.width / 2;
        const originalY = rect.top - containerRect.top + rect.height / 2;
        
        shapesRef.current.push({
          element: shape,
          originalX,
          originalY,
          currentX: originalX,
          currentY: originalY,
          velocityX: 0,
          velocityY: 0
        });
      });
    }
    
    // Animation function to update shape positions
    const animate = () => {
      if (!containerRef.current || shapesRef.current.length === 0) return;
      
      shapesRef.current.forEach(shape => {
        const shapeX = shape.currentX;
        const shapeY = shape.currentY;
        const distX = mousePosition.x - shapeX;
        const distY = mousePosition.y - shapeY;
        const distance = Math.sqrt(distX * distX + distY * distY);
        
        // Calculate repulsion force (stronger when closer)
        const maxForce = 2.0; // maximum repulsion force
        const threshold = 300; // distance threshold for repulsion
        
        if (distance < threshold) {
          // Calculate normalized repulsion direction away from mouse
          const repulsionStrength = maxForce * (1 - distance / threshold);
          const forceX = -distX / distance * repulsionStrength;
          const forceY = -distY / distance * repulsionStrength;
          
          // Apply force to velocity (with damping)
          shape.velocityX = shape.velocityX * 0.9 + forceX;
          shape.velocityY = shape.velocityY * 0.9 + forceY;
        }
        
        // Apply return-to-origin force
        const returnStrength = 0.02; // strength of return force
        const returnX = (shape.originalX - shape.currentX) * returnStrength;
        const returnY = (shape.originalY - shape.currentY) * returnStrength;
        
        // Update velocity with return force
        shape.velocityX += returnX;
        shape.velocityY += returnY;
        
        // Apply friction to gradually slow down
        shape.velocityX *= 0.95;
        shape.velocityY *= 0.95;
        
        // Update position
        shape.currentX += shape.velocityX;
        shape.currentY += shape.velocityY;
        
        // Apply the new position to the element
        shape.element.style.transform = `translate(${shape.currentX - shape.originalX}px, ${shape.currentY - shape.originalY}px)`;
      });
      
      requestRef.current = requestAnimationFrame(animate);
    };
    
    requestRef.current = requestAnimationFrame(animate);
    
    // Cleanup on theme change
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [mousePosition]);
  
  // Comment out other theme-specific functions
  /*
  // Update interactive elements when mouse position changes
  useEffect(() => {
    if (currentLandingTheme === 'interactiveGrid' && containerRef.current) {
      updateInteractiveGrid();
    }
    
    if (currentLandingTheme === 'neonGrid' && containerRef.current) {
      updateNeonGrid();
    }
  }, [mousePosition, currentLandingTheme]);
  
  // Function to initialize canvas-based animations
  const initCanvas = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions
    const setCanvasDimensions = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasDimensions();
    
    // Handle resize
    window.addEventListener('resize', setCanvasDimensions);
    
    // Set up animation based on current theme
    if (currentLandingTheme === 'glowingParticles') {
      initGlowingParticles(canvas, ctx);
    } else if (currentLandingTheme === 'magicDust') {
      initMagicDust(canvas, ctx);
    }
  };
  
  // Glowing Particles animation
  const initGlowingParticles = (canvas, ctx) => {
    // ... existing code ...
  };
  
  // Magic Dust animation
  const initMagicDust = (canvas, ctx) => {
    // ... existing code ...
  };
  
  // Helper function to create magic dust particles
  const createParticle = (particles, canvas, replace = false) => {
    // ... existing code ...
  };
  
  // Update Interactive Grid based on mouse position
  const updateInteractiveGrid = () => {
    // ... existing code ...
  };
  
  // Update Neon Grid based on mouse position
  const updateNeonGrid = () => {
    // ... existing code ...
  };
  */
  
  // Navigate to login or signup page
  const handleLogin = () => {
    navigate('/login');
  };
  
  const handleSignUp = () => {
    navigate('/login', { state: { isSignUp: true } });
  };
  
  // Remove theme selection handlers
  /*
  const toggleThemeSelector = (e) => {
    e.stopPropagation();
    setShowThemeSelector(prev => !prev);
  };
  
  const handleThemeSelect = (themeKey, e) => {
    e.stopPropagation();
    setLandingTheme(themeKey);
    setShowThemeSelector(false);
    
    // Reset shapes ref when changing themes
    shapesRef.current = [];
  };
  */
  
  // Get the current theme details
  const currentTheme = landingThemes.floatingShapes;
  
  return (
    <div 
      ref={containerRef}
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden landing-floating-shapes"
      style={{ background: "#0F172A" }}
    >
      {/* Floating Shapes background elements */}
      <div className="floating-shapes-container absolute inset-0 pointer-events-none">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
        <div className="shape shape-5"></div>
        <div className="shape shape-6"></div>
        <div className="shape shape-7"></div>
        <div className="shape shape-8"></div>
        <div className="shape shape-9"></div>
        <div className="shape shape-10"></div>
      </div>
      
      {/* Remove theme selector button */}
      
      {/* Main content with text and CTA */}
      <div 
        className={`text-center px-6 z-10 transform transition-all duration-1000 ease-out ${
          animateIn ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
        }`}
      >
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tight leading-tight">
          Welcome to <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">NoteFlow</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed mb-16">
          Revolutionizing note-taking with AI-powered structuring, seamless visualization, and effortless transformation of raw content into beautiful documents.
        </p>
        
        {/* Custom Buttons Component */}
        <div className="flex flex-col items-center justify-center w-full max-w-md gap-4 md:flex-row mx-auto">
          {/* Sign Up Button - Primary */}
          <button 
            onClick={handleSignUp}
            className="relative w-full md:w-48 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl overflow-hidden group transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30"
          >
            {/* Animated background particles */}
            <div className="absolute inset-0 w-full h-full">
              <div className="absolute top-1/4 left-1/4 w-12 h-12 bg-white/10 rounded-full blur-xl transform transition-transform duration-700 group-hover:translate-x-2 group-hover:translate-y-2"></div>
              <div className="absolute bottom-1/3 right-1/4 w-16 h-16 bg-purple-300/10 rounded-full blur-xl transform transition-transform duration-700 group-hover:-translate-x-3 group-hover:-translate-y-3"></div>
            </div>
            
            {/* Button content with glow effect */}
            <div className="relative flex items-center justify-center w-full h-full px-8">
              <span className="text-white font-semibold text-lg tracking-wider mr-4">Sign Up</span>
              <div className="absolute right-6 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white transform transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </div>
            
            {/* Subtle border glow */}
            <div className="absolute inset-0 rounded-xl border border-white/20 pointer-events-none"></div>
          </button>

          {/* Log In Button - Secondary */}
          <button 
            onClick={handleLogin}
            className="relative w-full md:w-48 h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden group transition-all duration-300 hover:bg-white/15 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/10"
          >
            {/* Subtle hover effect */}
            <div className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            {/* Button content */}
            <div className="relative flex items-center justify-center w-full h-full">
              <span className="text-white font-medium text-lg tracking-wider group-hover:text-white transition-colors duration-300">Log In</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
