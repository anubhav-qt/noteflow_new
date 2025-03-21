import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { useTheme } from '../contexts/ThemeContext';
import NavBar from './NavBar';

function NotFound() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(currentUser => {
      setUser(currentUser);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${
      isDarkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'
    }`}>
      <div className="container mx-auto px-4 py-2">
        {/* Add NavBar component */}
        <NavBar user={user} />
        
        <div className="flex flex-col items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <h1 className="text-6xl font-bold mb-6">404</h1>
            <h2 className="text-2xl font-semibold mb-8">Page Not Found</h2>
            <p className="mb-8 text-lg">
              The page you're looking for doesn't exist or has been moved.
            </p>
            
            {/* Remove old navigation buttons since we have the NavBar now */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
