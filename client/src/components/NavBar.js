import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiSun, FiMoon, FiHome, FiLogIn, FiLogOut, FiUser, FiX } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { auth } from '../firebase/config';
import { signOut } from 'firebase/auth';

const NavBar = ({ user }) => {
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useTheme();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const navRef = useRef(null);
  const [activeIndicatorStyle, setActiveIndicatorStyle] = useState({});
  
  // Helper to check if the current path matches
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Calculate which button is active - modified to never highlight logout
  const getActiveIndex = () => {
    if (isActive('/home')) return 0;
    if (isActive('/dashboard')) return 1;
    if (isActive('/login') && !user) return 2; // Only highlight login when not logged in
    return -1; // No active button
  };

  // Update highlight based on active path
  useEffect(() => {
    updateIndicatorPosition();
  }, [location.pathname]);
  
  const updateIndicatorPosition = () => {
    if (!navRef.current) return;
    
    const activeIndex = getActiveIndex();
    if (activeIndex === -1) {
      // Hide indicator if no active page
      setActiveIndicatorStyle({ opacity: 0 });
      return;
    }
    
    const buttons = navRef.current.querySelectorAll('.nav-button');
    if (activeIndex >= buttons.length) {
      // Index out of bounds protection
      setActiveIndicatorStyle({ opacity: 0 });
      return;
    }
    
    const activeButton = buttons[activeIndex];
    
    if (activeButton) {
      // Set position and dimensions to match the active button exactly
      setActiveIndicatorStyle({
        left: `${activeButton.offsetLeft}px`,
        width: `${activeButton.offsetWidth}px`,
        height: `${activeButton.offsetHeight}px`,
        opacity: 1
      });
    }
  };
  
  // Recalculate indicator on window resize
  useEffect(() => {
    window.addEventListener('resize', updateIndicatorPosition);
    return () => window.removeEventListener('resize', updateIndicatorPosition);
  }, []);
  
  // Show logout confirmation modal
  const showLogoutConfirmation = (e) => {
    e.preventDefault();
    setShowLogoutModal(true);
  };
  
  // Handle logout after confirmation
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowLogoutModal(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };
  
  // Cancel logout
  const cancelLogout = () => {
    setShowLogoutModal(false);
  };
  
  return (
    <>
      <div className="flex justify-between items-center mb-12">
        {/* NoteFlow logo with gradient text */}
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
          NoteFlow
        </h1>
        
        <div className="flex items-center gap-4">
          {/* Navigation Group */}
          <div 
            ref={navRef}
            className={`relative flex items-center ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            } rounded-full p-1 shadow-sm`}
          >
            {/* Solid blue active indicator pill */}
            <div 
              className={`absolute rounded-full transition-all duration-300 ease-in-out z-0 ${
                isDarkMode 
                  ? 'bg-blue-600' 
                  : 'bg-blue-500'
              }`}
              style={activeIndicatorStyle}
            ></div>
            
            {/* Home button */}
            <Link 
              to="/home"
              className={`nav-button px-4 py-2 rounded-full flex items-center gap-2 z-10 transition-colors ${
                isActive('/home') ? 'text-white font-medium' : (isDarkMode ? 'text-gray-300' : 'text-gray-600')
              }`}
            >
              <FiHome className="h-5 w-5" />
              <span>Home</span>
            </Link>
            
            {/* Dashboard button */}
            <Link 
              to="/dashboard"
              className={`nav-button px-4 py-2 rounded-full flex items-center gap-2 z-10 transition-colors ${
                isActive('/dashboard') ? 'text-white font-medium' : (isDarkMode ? 'text-gray-300' : 'text-gray-600')
              }`}
            >
              <FiUser className="h-5 w-5" />
              <span>Dashboard</span>
            </Link>
            
            {/* Login/Logout button - Modified to avoid highlighting Logout */}
            {user ? (
              <button 
                onClick={showLogoutConfirmation}
                className="nav-button px-4 bg-transparent py-2 rounded-full flex items-center gap-2 z-10 transition-colors text-gray-300 dark:text-gray-300"
              >
                <FiLogOut className="h-5 w-5" />
                <span>Logout</span>
              </button>
            ) : (
              <Link 
                to="/login"
                className={`nav-button px-4 py-2 rounded-full flex items-center gap-2 z-10 transition-colors ${
                  isActive('/login') ? 'text-white font-medium' : (isDarkMode ? 'text-gray-300' : 'text-gray-600')
                }`}
              >
                <FiLogIn className="h-5 w-5" />
                <span>Login</span>
              </Link>
            )}
          </div>
          
          {/* Theme toggle button - visually separated */}
          <button 
            onClick={toggleTheme} 
            className={`p-3 rounded-full transition-all shadow-sm ${
              isDarkMode 
                ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' 
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            aria-label="Toggle theme"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <FiSun className="h-5 w-5" /> : <FiMoon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          {/* Backdrop with blur effect */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={cancelLogout}
          ></div>
          
          {/* Modal content */}
          <div className={`relative w-full max-w-md p-6 rounded-lg shadow-2xl transform transition-all ${
            isDarkMode 
              ? 'bg-gray-800 border border-white/10 text-white' 
              : 'bg-white text-gray-900'
          }`}>
            {/* Close button */}
            <button 
              onClick={cancelLogout}
              className={`absolute top-3 right-3 p-1 rounded-full bg-gray-800 ${
                isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <FiX className="h-5 w-5" />
            </button>
            
            <h3 className="text-xl font-semibold mb-4">Confirm Logout</h3>
            <p className={`mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Are you sure you want to log out of your account?
            </p>
            
            <div className="flex gap-3 justify-end">
              {/* Cancel button */}
              <button 
                onClick={cancelLogout}
                className={`px-4 py-2 rounded-md ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
              >
                Cancel
              </button>
              
              {/* Confirm logout button */}
              <button 
                onClick={handleLogout}
                className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                  isDarkMode 
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700' 
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                } text-white`}
              >
                <FiLogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavBar;
