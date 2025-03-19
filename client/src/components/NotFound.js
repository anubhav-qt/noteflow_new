import React from 'react';
import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-gray-600 mb-8">The page you are looking for does not exist.</p>
        <Link 
          to="/" 
          className="bg-primary hover:bg-primary-dark text-white font-medium py-2 px-6 rounded-md transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
