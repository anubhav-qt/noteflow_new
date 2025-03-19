import React from 'react';
import { useNavigate } from 'react-router-dom';

function LandingPage() {
  const navigate = useNavigate();
  
  const handleClick = () => {
    navigate('/home');
  };
  
  return (
    <div 
      className="h-screen w-full flex flex-col items-center justify-center cursor-pointer"
      onClick={handleClick}
      style={{
        background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)",
      }}
    >
      <div className="text-center px-6 animate-fade-in">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
          Welcome to NoteFlow
        </h1>
        <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed">
          Revolutionizing note-taking with AI-powered structuring, seamless visualization, and effortless transformation of raw content into beautiful documents.
        </p>
        <div className="mt-16">
          <p className="text-white/80 text-lg animate-pulse">
            Click anywhere to continue...
          </p>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
