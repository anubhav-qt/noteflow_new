import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { FiSun, FiMoon, FiSend, FiPaperclip, FiImage, FiLogIn, FiUser, FiX, FiArrowLeft } from 'react-icons/fi';
import { HiOutlineDocumentText, HiOutlinePencil, HiOutlineVolumeUp, HiOutlineBookOpen } from 'react-icons/hi';
import { auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import apiService from '../services/api';

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
  // New state for UI mode (input or result)
  const [showResults, setShowResults] = useState(false);
  // State for animation
  const [resultAnimation, setResultAnimation] = useState(false);
  const [generatePdf, setGeneratePdf] = useState(false);
  
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
      console.log('Home component - PDF generation flag status:', {
        generatePdf,
        type: typeof generatePdf
      });
      
      setProcessing(true);
      setError(null);
      setResult(null);
      
      // Check server health first
      try {
        await apiService.health();
      } catch (healthErr) {
        throw new Error('Server is not responding. Please try again later.');
      }
      
      let response;
      
      if (selectedFile) {
        // Handle file upload - make sure generatePdf is being passed correctly
        response = await apiService.beautifyWithFile(
          selectedFile, 
          fileInputType, 
          inputText, 
          generatePdf // Just pass the boolean directly
        );
      } else {
        // Handle text input - make sure generatePdf is being passed correctly
        response = await apiService.beautify(
          inputText, 
          'text/plain', 
          generatePdf // Just pass the boolean directly
        );
      }
      
      // Set the initial result without PDF
      setResult(response.data);
      
      // If we have diagram or flowchart prompts, generate the visuals
      if ((response.data.fullOutput.diagram_prompts?.length > 0) || 
          (response.data.fullOutput.flowcharts_prompt?.length > 0)) {
        
        try {
          // Show a notification that visuals are being generated
          setResult(prevResult => ({
            ...prevResult,
            generatingVisuals: true
          }));
          
          // Call the visuals generation endpoint
          const visualsResponse = await apiService.generateVisuals(
            response.data.fullOutput.diagram_prompts,
            response.data.fullOutput.flowcharts_prompt,
            response.data.fullOutput.concepts_flowcharts
          );
          
          // Update the result with the generated visuals
          setResult(prevResult => ({
            ...prevResult,
            generatingVisuals: false,
            visuals: visualsResponse.data
          }));
          
          // If PDF was requested, generate it now that we have the visuals
          if (generatePdf || response.data.pdfRequested) {
            setResult(prevResult => ({
              ...prevResult,
              generatingPdf: true
            }));
            
            // Generate PDF with all content including visuals
            const pdfResponse = await apiService.generatePdf(
              response.data,
              visualsResponse.data.diagrams,
              visualsResponse.data.flowcharts
            );
            
            // Process PDF response
            if (pdfResponse.data.pdf) {
              console.log('PDF data received after visuals, creating blob and URL...');
              try {
                // Convert base64 to blob
                const byteString = atob(pdfResponse.data.pdf);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                  ia[i] = byteString.charCodeAt(i);
                }
                const pdfBlob = new Blob([ab], { type: 'application/pdf' });
                
                // Create a URL for the blob
                const pdfUrl = URL.createObjectURL(pdfBlob);
                console.log('Created PDF URL after visuals:', pdfUrl);
                
                // Store the blob in a global variable to prevent garbage collection
                window._pdfBlob = pdfBlob;
                
                // Update the result with the PDF URL
                setResult(prevResult => ({
                  ...prevResult,
                  pdfUrl: pdfUrl,
                  generatingPdf: false
                }));
              } catch (pdfError) {
                console.error('Error processing PDF data:', pdfError);
                setResult(prevResult => ({
                  ...prevResult,
                  pdfError: pdfError.message,
                  generatingPdf: false
                }));
              }
            } else {
              setResult(prevResult => ({
                ...prevResult,
                pdfError: "No PDF data received",
                generatingPdf: false
              }));
            }
          }
        } catch (visualErr) {
          // Update the result with the error
          setResult(prevResult => ({
            ...prevResult,
            generatingVisuals: false,
            visualsError: visualErr.message
          }));
        }
      } else if (generatePdf || response.data.pdfRequested) {
        // No visuals to generate, but PDF was requested
        setResult(prevResult => ({
          ...prevResult,
          generatingPdf: true
        }));
        
        // Generate PDF without visuals
        const pdfResponse = await apiService.generatePdf(
          response.data,
          [],
          []
        );
        
        // Process PDF response
        if (pdfResponse.data.pdf) {
          console.log('PDF data received (no visuals), creating blob and URL...');
          try {
            // Convert base64 to blob
            const byteString = atob(pdfResponse.data.pdf);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const pdfBlob = new Blob([ab], { type: 'application/pdf' });
            
            // Create a URL for the blob
            const pdfUrl = URL.createObjectURL(pdfBlob);
            console.log('Created PDF URL (no visuals):', pdfUrl);
            
            // Store the blob in a global variable to prevent garbage collection
            window._pdfBlob = pdfBlob;
            
            // Update the result with the PDF URL
            setResult(prevResult => ({
              ...prevResult,
              pdfUrl: pdfUrl,
              generatingPdf: false
            }));
          } catch (pdfError) {
            console.error('Error processing PDF data:', pdfError);
            setResult(prevResult => ({
              ...prevResult,
              pdfError: pdfError.message,
              generatingPdf: false
            }));
          }
        } else {
          setResult(prevResult => ({
            ...prevResult,
            pdfError: "No PDF data received",
            generatingPdf: false
          }));
        }
      }
      
      // Animate to results view
      setShowResults(true);
      setTimeout(() => {
        setResultAnimation(true);
      }, 100);
      
      setInputText('');
      clearSelectedFile();
    } catch (err) {
      const errorMessage = err.response?.data?.details || 
                          err.response?.data?.error || 
                          err.message || 
                          'Failed to process your input. Please try again.';
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };
  
  // Function to go back to input mode
  const handleBackToInput = () => {
    setResultAnimation(false);
    setTimeout(() => {
      setShowResults(false);
      setResult(null);
    }, 300); // Wait for animation to complete
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
          {/* Conditional rendering based on showResults state */}
          <div className={`transition-all duration-300 transform ${showResults ? 'opacity-0 scale-95 h-0 overflow-hidden' : 'opacity-100 scale-100'}`}>
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
          </div>
          
          {/* Results section with animation */}
          <div 
            className={`transition-all duration-500 transform ${
              showResults && resultAnimation 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-10 h-0 overflow-hidden'
            }`}
          >
            {result && (
              <div className="mb-8">
                <button 
                  onClick={handleBackToInput} 
                  className={`mb-6 flex items-center gap-2 py-2 px-4 rounded-md ${
                    isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'
                  } transition-colors`}
                >
                  <FiArrowLeft className="h-5 w-5" />
                  <span>Back to Input</span>
                </button>
                
                <div className={`p-6 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                  <h2 className="text-xl font-bold mb-4">Result</h2>
                  <div className="prose max-w-none dark:prose-invert">
                    <h3 className="text-lg font-semibold mb-2">Summary</h3>
                    <p className="mb-4">{result.summary}</p>
                    
                    {/* Add warning for potentially blank or unprocessable files */}
                    {result.summary.toLowerCase().includes('blank') || 
                     result.summary.toLowerCase().includes('empty') || 
                     result.summary.toLowerCase().includes('cannot process') || 
                     result.summary.toLowerCase().includes('unable to') ? (
                      <div className={`p-4 mb-4 rounded-lg ${isDarkMode ? 'bg-yellow-900/30 text-yellow-200' : 'bg-yellow-50 text-yellow-800'}`}>
                        <p className="font-medium">⚠️ The file may be blank or in a format that can't be properly processed.</p>
                        <p className="text-sm mt-1">Try uploading a different file or providing more context in the text input.</p>
                      </div>
                    ) : null}
                    
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
                    
                    {/* Show loading state for visuals generation */}
                    {result.generatingVisuals && (
                      <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <div className="flex items-center">
                          <div className="mr-3">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                          <p>Generating visual elements. This may take a few moments...</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Display visuals error if any */}
                    {result.visualsError && (
                      <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-700'}`}>
                        <p className="font-medium">Error generating visuals:</p>
                        <p>{result.visualsError}</p>
                      </div>
                    )}
                    
                    {/* Display generated diagrams */}
                    {result.visuals?.diagrams?.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-3">Generated Diagrams</h3>
                        <div className="grid grid-cols-1 gap-6">
                          {result.visuals.diagrams.map((diagram, idx) => (
                            <div key={`diagram-${idx}`} className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                              <h4 className="font-medium mb-2">{result.fullOutput.concepts_diagram[diagram.index]}</h4>
                              {diagram.error ? (
                                <p className="text-red-500">{diagram.error}</p>
                              ) : (
                                <div className="flex justify-center">
                                  <img 
                                    src={`data:image/png;base64,${diagram.image}`}
                                    alt={`Diagram for ${result.fullOutput.concepts_diagram[diagram.index]}`}
                                    className="max-w-full rounded-md"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Display generated flowcharts */}
                    {result.visuals?.flowcharts?.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-3">Generated Flowcharts</h3>
                        <div className="grid grid-cols-1 gap-6">
                          {result.visuals.flowcharts.map((flowchart, idx) => (
                            <div key={`flowchart-${idx}`} className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                              <h4 className="font-medium mb-2">{flowchart.name}</h4>
                              {flowchart.error ? (
                                <p className="text-red-500">{flowchart.error}</p>
                              ) : (
                                <div className="flex justify-center">
                                  <img 
                                    src={`data:image/png;base64,${flowchart.image}`}
                                    alt={`Flowchart for ${flowchart.name}`}
                                    className="max-w-full rounded-md"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Add PDF buttons with fixed URLs - add more debug info */}
                    {result?.pdfUrl && (
                      <div className="mt-6 border-t pt-4 border-gray-300 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-3">PDF Document</h3>
                        <div className="flex flex-col sm:flex-row gap-3">
                          {/* Download Link - Method 1 */}
                          <a 
                            href={result.pdfUrl} 
                            download="noteflow-document.pdf"
                            className={`inline-flex items-center px-4 py-2 rounded-md ${
                              isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
                            } text-white font-medium`}
                            onClick={(e) => {
                              console.log('Download PDF clicked with URL:', result.pdfUrl);
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Download PDF
                          </a>
                          
                          {/* View PDF in Browser - Method 2 */}
                          <button
                            onClick={() => {
                              console.log('Opening PDF in new window:', result.pdfUrl);
                              window.open(result.pdfUrl, '_blank');
                            }}
                            className={`inline-flex items-center px-4 py-2 rounded-md ${
                              isDarkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'
                            } text-white font-medium`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                            </svg>
                            View PDF in Browser
                          </button>
                        </div>
                        
                        {/* PDF Preview Section */}
                        <div className="mt-4">
                          <h4 className="text-md font-medium mb-2">Preview</h4>
                          <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden" style={{height: '300px'}}>
                            <iframe 
                              src={result.pdfUrl} 
                              className="w-full h-full" 
                              title="PDF Preview"
                            ></iframe>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Add PDF modal/overlay for viewing PDFs inline */}
                    <div 
                      id="pdf-modal" 
                      className="hidden fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
                      onClick={(e) => {
                        // Close modal when clicking outside the iframe
                        if (e.target.id === 'pdf-modal') {
                          document.getElementById('pdf-modal').classList.add('hidden');
                          document.getElementById('pdf-iframe').src = '';
                        }
                      }}
                    >
                      <div className="bg-white rounded-lg overflow-hidden w-full max-w-5xl h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center bg-gray-100 px-4 py-2">
                          <h3 className="font-medium">PDF Document</h3>
                          <button 
                            onClick={() => {
                              document.getElementById('pdf-modal').classList.add('hidden');
                              document.getElementById('pdf-iframe').src = '';
                            }}
                            className="p-1 rounded-full hover:bg-gray-200"
                          >
                            <FiX className="w-5 h-5" />
                          </button>
                        </div>
                        <iframe id="pdf-iframe" className="flex-1 w-full" title="PDF Viewer"></iframe>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: isDarkMode ? '#4B5563 #1F2937' : '#E5E7EB #F3F4F6'
                }}
              ></textarea>
              
              <div className="flex justify-between items-center mt-2">
                <div className="flex gap-2 items-center">
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
                  
                  {/* Enhanced PDF option toggle with better debugging */}
                  <div className="flex items-center ml-4">
                    <input
                      type="checkbox"
                      id="generatePdf"
                      checked={generatePdf}
                      onChange={(e) => {
                        const newValue = e.target.checked;
                        console.log('PDF checkbox changed:', { 
                          oldValue: generatePdf,
                          newValue: newValue,
                          type: typeof newValue
                        });
                        setGeneratePdf(newValue);
                      }}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <label htmlFor="generatePdf" className="ml-2 text-sm font-medium">
                      Generate PDF ({String(generatePdf)})
                    </label>
                  </div>
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
          
          {/* Error display */}
          {error && (
            <div className={`mt-6 p-4 rounded-lg ${isDarkMode ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-700'}`}>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
