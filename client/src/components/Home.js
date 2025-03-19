import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { FiSun, FiMoon, FiSend, FiPaperclip, FiImage, FiLogIn, FiUser, FiX } from 'react-icons/fi';
import { HiOutlineDocumentText, HiOutlinePencil, HiOutlineVolumeUp, HiOutlineBookOpen } from 'react-icons/hi';
import { auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import apiService from '../services/api';
import logger from '../utils/apiLogger';

function Home() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [inputText, setInputText] = useState('');
  const [user, setUser] = useState(null);
  const textareaRef = useRef(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileInputType, setFileInputType] = useState('');
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    
    return () => unsubscribe();
  }, []);
  
  // Function to handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setSelectedFile(file);
    setFileInputType(file.type);
    
    // Create file preview based on file type
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview({
          type: 'image',
          url: reader.result
        });
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setFilePreview({
        type: 'video',
        url: url
      });
    } else if (file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file);
      setFilePreview({
        type: 'audio',
        url: url
      });
    } else if (file.type === 'application/pdf') {
      setFilePreview({
        type: 'pdf',
        name: file.name,
        size: (file.size / 1024).toFixed(2) + ' KB'
      });
    } else {
      // For other file types like text or code
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview({
          type: 'text',
          content: reader.result.substring(0, 500) + (reader.result.length > 500 ? '...' : '')
        });
      };
      reader.readAsText(file);
    }
  };
  
  // Function to clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Revoke object URL if it exists to prevent memory leaks
    if (filePreview?.url && (filePreview.type === 'video' || filePreview.type === 'audio')) {
      URL.revokeObjectURL(filePreview.url);
    }
  };
  
  // Function to trigger file input click
  const triggerFileInput = (acceptType) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptType;
      fileInputRef.current.click();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!inputText.trim() && !selectedFile) {
      return; // Require either text or a file
    }
    
    try {
      logger.info('Home', 'Processing input', { 
        hasText: !!inputText.trim(), 
        hasFile: !!selectedFile 
      });
      
      setProcessing(true);
      setError(null);
      setResult(null);
      
      // Check server health first
      try {
        await apiService.health();
      } catch (healthErr) {
        logger.error('Home', 'Health check failed', healthErr);
        throw new Error('Server is not responding. Please try again later.');
      }
      
      let response;
      
      if (selectedFile) {
        // Handle file upload
        response = await apiService.beautifyWithFile(selectedFile, fileInputType);
      } else {
        // Handle text input
        response = await apiService.beautify(inputText);
      }
      
      // Display the result
      logger.debug('Home', 'Received beautification result', response.data);
      setResult(response.data);
      setInputText('');
      clearSelectedFile();
    } catch (err) {
      logger.error('Home', 'Error processing input', err);
      const errorMessage = err.response?.data?.details || 
                          err.response?.data?.error || 
                          err.message || 
                          'Failed to process your input. Please try again.';
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };
  
  const goToDashboard = () => {
    navigate('/dashboard');
  };
  
  const goToLogin = () => {
    navigate('/login');
  };
  
  const handleCardClick = (sourceType) => {
    console.log(`Selected source: ${sourceType}`);
    // Later: Implement specific handling for different content sources
  };

  const inputSourceCards = [
    { id: 'transcripts', title: 'From audio/video transcripts', icon: <HiOutlineVolumeUp className="h-8 w-8" /> },
    { id: 'handwritten', title: 'From handwritten notes', icon: <HiOutlinePencil className="h-8 w-8" /> },
    { id: 'digitaltext', title: 'From digital texts', icon: <HiOutlineDocumentText className="h-8 w-8" /> },
    { id: 'courses', title: 'From course material', icon: <HiOutlineBookOpen className="h-8 w-8" /> },
  ];

  // Function to auto-resize the textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height with a minimum of 56px (approximately 1 line)
    const newHeight = Math.min(textarea.scrollHeight, 120); // Max 3 lines (approx 120px)
    textarea.style.height = `${newHeight}px`;
  };
  
  // Adjust height when input text changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-2">
        {/* Header with theme toggle */}
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold">NoteFlow</h1>
          <div className="flex items-center gap-4">
            {user ? (
              <button 
                onClick={goToDashboard}
                className={`px-4 py-2 rounded-md flex items-center gap-2 ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-white hover:bg-gray-100 text-gray-800'} transition-colors`}
              >
                <FiUser className="h-5 w-5" />
                <span>Dashboard</span>
              </button>
            ) : (
              <button 
                onClick={goToLogin}
                className={`px-4 py-2 rounded-md flex items-center gap-2 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700 text-white'} transition-colors`}
              >
                <FiLogIn className="h-5 w-5" />
                <span>Login</span>
              </button>
            )}
            
            <button 
              onClick={toggleTheme} 
              className={`p-2 rounded-full ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-white hover:bg-gray-100 text-gray-800'} transition-colors`}
            >
              {isDarkMode ? <FiSun className="h-5 w-5" /> : <FiMoon className="h-5 w-5" />}
            </button>
          </div>
        </div>
        
        {/* Main content */}
        <div className="max-w-4xl mx-auto">
          <h1 className={`text-5xl font-bold text-center mb-12 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
            Create Beautiful Notes
          </h1>
          
          {/* Input source cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {inputSourceCards.map(card => (
              <div 
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                className={`cursor-pointer p-6 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  isDarkMode 
                    ? 'bg-gray-800 hover:bg-gray-700 shadow-lg shadow-gray-800/50' 
                    : 'bg-white hover:shadow-xl shadow-md'
                }`}
              >
                <div className="flex flex-col items-center text-center">
                  <div className={`mb-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    {card.icon}
                  </div>
                  <h3 className="font-medium">{card.title}</h3>
                </div>
              </div>
            ))}
          </div>
          
          {/* Input component (ChatGPT/Gemini style) */}
          <div className={`mt-8 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-white'} shadow-lg`}>
            <form onSubmit={handleSubmit} className="p-4">
              {/* Hidden file input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden"
              />
              
              {/* File preview area */}
              {filePreview && (
                <div className={`mb-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'} relative`}>
                  <button 
                    type="button" 
                    onClick={clearSelectedFile}
                    className={`absolute top-2 right-2 p-1 rounded-full ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'}`}
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                  
                  {filePreview.type === 'image' && (
                    <div className="flex justify-center">
                      <img 
                        src={filePreview.url} 
                        alt="Selected" 
                        className="max-h-64 max-w-full rounded-md object-contain" 
                      />
                    </div>
                  )}
                  
                  {filePreview.type === 'video' && (
                    <div className="flex justify-center">
                      <video 
                        src={filePreview.url} 
                        className="max-h-64 max-w-full rounded-md" 
                        controls
                      />
                    </div>
                  )}
                  
                  {filePreview.type === 'audio' && (
                    <div className="flex justify-center">
                      <audio 
                        src={filePreview.url} 
                        className="w-full" 
                        controls
                      />
                    </div>
                  )}
                  
                  {filePreview.type === 'pdf' && (
                    <div className={`flex items-center justify-center p-4 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-md`}>
                      <HiOutlineDocumentText className="w-8 h-8 mr-3 text-red-500" />
                      <div>
                        <p className="font-medium">{filePreview.name}</p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          PDF Document • {filePreview.size}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {filePreview.type === 'text' && (
                    <div className={`p-4 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-md font-mono text-sm overflow-x-auto`}>
                      <pre className="whitespace-pre-wrap">{filePreview.content}</pre>
                    </div>
                  )}
                </div>
              )}
              
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={selectedFile ? "Add any additional instructions..." : "Enter text, paste content, or describe what you need..."}
                className={`w-full p-4 rounded-lg resize-none min-h-[56px] max-h-[120px] overflow-y-auto focus:outline-none border-0 ${
                  isDarkMode 
                    ? 'bg-gray-700 text-white scrollbar-dark' 
                    : 'bg-white text-gray-900 scrollbar-light'
                }`}
                rows="1"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: isDarkMode ? '#4B5563 #1F2937' : '#E5E7EB #F3F4F6'
                }}
              ></textarea>
              
              <div className="flex justify-between items-center mt-2">
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                    title="Upload document (PDF, TXT)"
                    onClick={() => triggerFileInput('application/pdf,text/plain')}
                  >
                    <HiOutlineDocumentText className="h-5 w-5" />
                  </button>
                  <button 
                    type="button" 
                    className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                    title="Upload image"
                    onClick={() => triggerFileInput('image/*')}
                  >
                    <FiImage className="h-5 w-5" />
                  </button>
                  <button 
                    type="button" 
                    className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                    title="Upload audio/video"
                    onClick={() => triggerFileInput('audio/*,video/*')}
                  >
                    <HiOutlineVolumeUp className="h-5 w-5" />
                  </button>
                </div>
                
                <button 
                  type="submit" 
                  disabled={(!inputText.trim() && !selectedFile) || processing}
                  className={`p-3 rounded-full ${
                    (inputText.trim() || selectedFile) && !processing
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : `${isDarkMode ? 'bg-gray-600 text-gray-400' : 'bg-gray-200 text-gray-500'}`
                  } transition-colors flex items-center justify-center`}
                >
                  {processing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <FiSend className="h-5 w-5" />
                  )}
                </button>
              </div>
            </form>
          </div>
          
          {/* Results section */}
          {error && (
            <div className={`mt-6 p-4 rounded-lg ${isDarkMode ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-700'}`}>
              <p>{error}</p>
            </div>
          )}
          
          {result && (
            <div className={`mt-6 p-6 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
              <h2 className="text-xl font-bold mb-4">Result</h2>
              <div className="prose max-w-none dark:prose-invert">
                <h3 className="text-lg font-semibold mb-2">Summary</h3>
                <p className="mb-4">{result.summary}</p>
                
                {result.hasDiagrams && (
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">Diagrams</h3>
                    <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <p className="mb-2">This content includes concepts that would benefit from visual diagrams:</p>
                      <ul className="list-disc ml-5 space-y-1">
                        {result.fullOutput.concepts_diagram.map((concept, idx) => (
                          <li key={idx}>{concept}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                
                {result.hasFlowcharts && (
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">Flowcharts</h3>
                    <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <p className="mb-2">This content includes processes that would benefit from flowchart visualization:</p>
                      <ul className="list-disc ml-5 space-y-1">
                        {result.fullOutput.concepts_flowcharts.map((concept, idx) => (
                          <li key={idx}>{concept}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
