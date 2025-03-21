import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup 
} from 'firebase/auth';
import { useTheme } from '../contexts/ThemeContext';
import { FiArrowLeft } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import NavBar from './NavBar';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(location.state?.isSignUp || false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  // Get the intended destination from location state, default to dashboard
  const from = location.state?.from?.pathname || "/dashboard";

  // Check for isSignUp in location state when the component mounts
  useEffect(() => {
    if (location.state?.isSignUp) {
      setIsSignUp(true);
    }
  }, [location.state]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Navigate to the intended destination after successful login
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Auth error:', error);
      
      // Provide more friendly error messages
      let errorMessage = error.message;
      if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid password. Please try again.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please sign up.';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists. Please log in.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle Google Sign-In with redirect to intended destination
  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // Navigate to the intended destination after successful login
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Google sign-in error:', error);
      
      // Handle Google sign-in errors
      let errorMessage = 'Google sign-in failed. Please try again.';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed. Please try again.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Multiple popup requests were made. Please try again.';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'The sign-in popup was blocked by your browser. Please allow popups for this site.';
      }
      
      setError(errorMessage);
    } finally {
      setGoogleLoading(false);
    }
  };
  
  // Go back to previous page instead of home
  const handleGoBack = () => {
    navigate(-1); // This navigates to the previous page
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'}`}>
      <div className="container mx-auto px-4 py-2">
        {/* Add NavBar component */}
        <NavBar user={null} />
        
        <div className="flex items-center justify-center pt-12">
          <div className="max-w-md w-full p-8 rounded-lg shadow-lg bg-white dark:bg-gray-800">
            {/* Remove the back button since we now have the NavBar */}
            
            <h1 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white">
              {isSignUp ? 'Create Your Account' : 'Welcome Back'}
            </h1>
            
            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-md text-sm">
                {error}
              </div>
            )}
            
            {/* Google Sign-In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full py-2.5 px-4 mb-6 border border-gray-300 dark:border-gray-600 rounded-md flex items-center justify-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-70"
            >
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <FcGoogle className="h-5 w-5" />
              )}
              <span className="text-gray-700 dark:text-gray-200 font-medium">
                {isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
              </span>
            </button>
            
            {/* Divider */}
            <div className="flex items-center mb-6">
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
              <span className="px-3 text-sm text-gray-500 dark:text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
            </div>
            
            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark text-white rounded-md transition-colors disabled:bg-gray-400 flex items-center justify-center"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>{isSignUp ? 'Sign Up' : 'Log In'}</span>
                )}
              </button>
            </form>
            
            {/* Enhanced toggle button section with better styling and animation */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                </p>
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="inline-block px-6 py-2.5 rounded-full text-sm font-medium transform transition-all duration-300 hover:scale-105 bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 text-white"
                >
                  {isSignUp ? 'Log In' : 'Sign Up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
