import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { FiSun, FiMoon, FiSend, FiPaperclip, FiImage, FiLogIn, FiUser, FiX, FiArrowLeft } from 'react-icons/fi';
import { HiOutlineDocumentText, HiOutlinePencil, HiOutlineVolumeUp, HiOutlineBookOpen } from 'react-icons/hi';
import { auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import apiService from '../services/api';
import NavBar from './NavBar';

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
  // Add a new state for process status tracking
  const [processingStatus, setProcessingStatus] = useState('');
  // Add a ref for scrolling to results
  const resultsRef = useRef(null);
  
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
      setProcessing(true);
      setError(null);
      setResult(null);
      setProcessingStatus('Analyzing content...');
      
      // Check server health first
      try {
        await apiService.health();
      } catch (healthErr) {
        throw new Error('Server is not responding. Please try again later.');
      }
      
      let response;
      
      if (selectedFile) {
        // Handle file upload - always generate PDF
        setProcessingStatus('Processing your file...');
        response = await apiService.beautifyWithFile(
          selectedFile, 
          fileInputType, 
          inputText, 
          true // Always generate PDF
        );
      } else {
        // Handle text input - always generate PDF
        setProcessingStatus('Processing your text...');
        response = await apiService.beautify(
          inputText, 
          'text/plain', 
          true // Always generate PDF
        );
      }
      
      // Set the initial result without PDF
      setResult(response.data);
      
      // Show results immediately after getting the summary
      setShowResults(true);
      setTimeout(() => {
        setResultAnimation(true);
        
        // Scroll to the results after showing them
        if (resultsRef.current) {
          resultsRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
      
      // Update processing status to indicate the next steps
      setProcessingStatus('Generating visual elements and PDF...');
      
      // If we have diagram or flowchart prompts, generate the visuals
      if ((response.data.fullOutput.diagram_prompts?.length > 0) || 
          (response.data.fullOutput.flowcharts_prompt?.length > 0)) {
        
        try {
          // Update processing status for visuals generation
          setProcessingStatus('Generating visual elements...');
          
          // Call the visuals generation endpoint
          const visualsResponse = await apiService.generateVisuals(
            response.data.fullOutput.diagram_prompts,
            response.data.fullOutput.flowcharts_prompt,
            response.data.fullOutput.concepts_flowcharts
          );
          
          // Update processing status for PDF generation
          setProcessingStatus('Creating your PDF document...');
          
          // Generate PDF with all content including visuals
          const pdfResponse = await apiService.generatePdf(
            response.data,
            visualsResponse.data.diagrams,
            visualsResponse.data.flowcharts
          );
          
          // Process PDF response
          if (pdfResponse.data.pdf) {
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
              
              // Store the blob in a global variable to prevent garbage collection
              window._pdfBlob = pdfBlob;
              
              // Update the result with the PDF URL and document title
              setResult(prevResult => ({
                ...prevResult,
                pdfUrl: pdfUrl,
                documentTitle: pdfResponse.data.documentTitle || 'NoteFlow Document',
                visuals: visualsResponse.data // Store visuals but we won't display them
              }));
              
              // Clear the processing status when done
              setProcessingStatus('');
              
              // Scroll to the PDF section
              setTimeout(() => {
                if (resultsRef.current) {
                  const pdfSection = document.getElementById('pdf-section');
                  if (pdfSection) {
                    pdfSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }
              }, 300);
            } catch (pdfError) {
              console.error('Error processing PDF data:', pdfError);
              setResult(prevResult => ({
                ...prevResult,
                pdfError: pdfError.message
              }));
              setProcessingStatus('');
            }
          } else {
            setResult(prevResult => ({
              ...prevResult,
              pdfError: "No PDF data received"
            }));
            setProcessingStatus('');
          }
        } catch (visualErr) {
          // Update the result with the error
          setResult(prevResult => ({
            ...prevResult,
            visualsError: visualErr.message
          }));
          setProcessingStatus('');
        }
      } else {
        // No visuals to generate, but still generate PDF
        setProcessingStatus('Creating your PDF document...');
        
        // Generate PDF without visuals
        const pdfResponse = await apiService.generatePdf(
          response.data,
          [],
          []
        );
        
        // Process PDF response
        if (pdfResponse.data.pdf) {
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
            
            // Store the blob in a global variable to prevent garbage collection
            window._pdfBlob = pdfBlob;
            
            // Update the result with the PDF URL
            setResult(prevResult => ({
              ...prevResult,
              pdfUrl: pdfUrl
            }));
            
            // Clear the processing status when done
            setProcessingStatus('');
            
            // Scroll to the results
            setTimeout(() => {
              if (resultsRef.current) {
                resultsRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }, 500);
          } catch (pdfError) {
            console.error('Error processing PDF data:', pdfError);
            setResult(prevResult => ({
              ...prevResult,
              pdfError: pdfError.message
            }));
            setProcessingStatus('');
          }
        } else {
          setResult(prevResult => ({
            ...prevResult,
            pdfError: "No PDF data received"
          }));
          setProcessingStatus('');
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
      setProcessingStatus('');
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
    
    // Calculate new height based on content
    // Start with just one line height and expand as needed
    const lineHeight = 24; // approximate line height in pixels
    const minHeight = 24; // one line minimum
    const maxHeight = lineHeight * 5; // max 5 lines (adjust as needed)
    
    // Get the actual content height and constrain between min and max
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  };
  
  // Adjust height when input text changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText]);

  // Add a new function to save PDF to Firestore
  const savePdfToCloud = async (pdfUrl, pdfTitle) => {
    if (!user) {
      // If user is not logged in, prompt them to log in
      setError("Please log in to save notes to the cloud");
      return;
    }
    
    try {
      setProcessingStatus('Saving to cloud...');
      
      // Fetch the PDF data as an ArrayBuffer
      const response = await fetch(pdfUrl);
      const pdfBlob = await response.blob();
      
      // Convert blob to base64
      const reader = new FileReader();
      
      // Use a promise to wait for the FileReader to complete
      const base64Data = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          // Get the base64 string (remove the data URL prefix)
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });
      
      // Generate a unique ID for the note
      const noteId = Date.now().toString();
      
      // Determine PDF title, prioritize the document title from the API response
      const noteName = result?.documentTitle || pdfTitle || `Note ${new Date().toLocaleDateString()}`;
      
      console.log(`Saving note to cloud: "${noteName}" for user ${user.uid}`);
      
      // Create the note document in Firestore with all required fields
      await setDoc(doc(db, "notes", noteId), {
        userId: user.uid,
        title: noteName,
        pdfData: base64Data,
        // Ensure we create a proper timestamp that Firestore can query
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Add a type field to make filtering easier
        type: "pdf",
        // Add a status field to match the processedNotes collection
        status: "completed"
      });
      
      console.log(`Note saved successfully with ID: ${noteId}`);
      
      setProcessingStatus('Note saved to cloud!');
      
      // Clear status message after 3 seconds
      setTimeout(() => {
        setProcessingStatus('');
      }, 3000);
      
    } catch (error) {
      console.error("Error saving PDF to cloud:", error);
      setError("Failed to save note to cloud: " + error.message);
      setProcessingStatus('');
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-[#0F172A] text-white' // Landing page dark background color
        : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 text-gray-900'
    }`}>
      <div className="container mx-auto px-4 py-2">
        {/* Replace the existing header with the NavBar component */}
        <NavBar user={user} />
        
        {/* Main content */}
        <div className="max-w-4xl mx-auto">
          {/* Rest of the existing code */}
          
          {/* Conditional rendering based on showResults state */}
          <div className={`transition-all duration-300 transform ${
            showResults ? 'opacity-0 scale-95 h-0 overflow-hidden' : 'opacity-100 scale-100'
          } flex flex-col justify-center`}> {/* Added flexbox centering */}
            <h1 className={`text-5xl font-bold text-center mb-12 ${
              isDarkMode 
                ? 'bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500' // Gradient text like landing page
                : 'text-gray-800'
            }`}>
              Create Aesthetic Notes
            </h1>
            
            {/* Input source cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {inputSourceCards.map(card => (
                <div 
                  key={card.id}
                  onClick={() => handleCardClick(card.id)}
                  className={`cursor-pointer p-6 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                    isDarkMode 
                      ? 'bg-gray-800/50 hover:bg-gray-700/50 shadow-lg border border-white/5' // More landing-page like styling 
                      : 'bg-white hover:shadow-xl shadow-md'
                  }`}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className={`mb-4 ${
                      isDarkMode ? 'text-blue-400' : 'text-blue-600'
                    }`}>
                      {card.icon}
                    </div>
                    <h3 className="font-medium">{card.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Results section with animation - Updated for better layout */}
          <div 
            className={`transition-all duration-500 transform ${
              showResults && resultAnimation 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-10 h-0 overflow-hidden'
            }`}
            ref={resultsRef}
          >
            {result && (
              <div className={`mb-8 overflow-auto max-h-[60vh] pr-4 ${  // Added pr-4 for right padding
                isDarkMode ? 'scrollbar-dark' : 'scrollbar-light'
              }`}>
                <button 
                  onClick={handleBackToInput} 
                  className={`mb-6 flex items-center gap-2 py-2 px-4 rounded-md ${
                    isDarkMode 
                      ? 'bg-gray-800/80 hover:bg-gray-700/80 border border-white/10' // Landing page style 
                      : 'bg-white hover:bg-gray-100'
                  } transition-colors`}
                >
                  <FiArrowLeft className="h-5 w-5" />
                  <span>Back to Input</span>
                </button>
                
                {/* Summary Card - Always shows immediately after beautify call returns */}
                <div className={`p-6 rounded-lg ${
                  isDarkMode 
                    ? 'bg-gray-800/70 border border-white/10' // Lighter background, thin border
                    : 'bg-white'
                } shadow-lg mb-6`}>
                  <h2 className="text-xl font-bold mb-4">Summary</h2>
                  <p className="mb-4 text-lg">{result.summary}</p>
                  
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
                  
                  {/* Show processing status if any - Make this more prominent */}
                  {processingStatus && (
                    <div className={`mt-6 p-4 rounded-lg animate-pulse ${
                      isDarkMode ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50'
                    }`}>
                      <div className="flex items-center">
                        <div className="mr-3">
                          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <p className={`font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>{processingStatus}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* PDF Document Card - Only shown when ready */}
                {result?.pdfUrl && (
                  <div id="pdf-section" className={`p-6 rounded-lg ${
                    isDarkMode 
                      ? 'bg-gray-800/70 border border-white/10' // Lighter background, thin border
                      : 'bg-white'
                  } shadow-lg`}>
                    <h2 className="text-xl font-bold mb-4">PDF Document</h2>
                    
                    {/* PDF action buttons - Updated with Save to Cloud */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-5">
                      <a 
                        onClick={(e) => {
                          e.preventDefault();
                          // Download locally AND save to cloud
                          savePdfToCloud(result.pdfUrl, result.documentTitle || result.fullOutput?.title || "NoteFlow Document");
                          // Then trigger the download
                          const link = document.createElement('a');
                          link.href = result.pdfUrl;
                          link.download = `${result.documentTitle || "noteflow-document"}.pdf`;
                          link.click();
                        }}
                        href={result.pdfUrl} 
                        download={`${result.documentTitle || "noteflow-document"}.pdf`}
                        className={`inline-flex items-center justify-center px-4 py-2 rounded-md ${
                          isDarkMode 
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700' // Gradient button
                            : 'bg-blue-600 hover:bg-blue-700'
                        } text-white font-medium cursor-pointer`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Download PDF
                      </a>
                      
                      <button
                        onClick={() => window.open(result.pdfUrl, '_blank')}
                        className={`inline-flex items-center justify-center px-4 py-2 rounded-md ${
                          isDarkMode 
                            ? 'bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700' // Gradient button
                            : 'bg-green-600 hover:bg-green-700'
                        } text-white font-medium`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        View PDF in Browser
                      </button>
                      
                      {/* New Save to Cloud button */}
                      <button
                        onClick={() => savePdfToCloud(result.pdfUrl, result.documentTitle || result.fullOutput?.title || "NoteFlow Document")}
                        className={`inline-flex items-center justify-center px-4 py-2 rounded-md ${
                          isDarkMode 
                            ? 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700' // Gradient button
                            : 'bg-purple-600 hover:bg-purple-700'
                        } text-white font-medium`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                          <path d="M9 12.75l3 3m0 0l3-3m-3 3v-7.5" />
                        </svg>
                        Save to Cloud
                      </button>
                    </div>
                    
                    {/* PDF Preview Section */}
                    <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden" style={{height: '500px'}}>
                      <iframe 
                        src={result.pdfUrl} 
                        className="w-full h-full" 
                        title="PDF Preview"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Input component - Modern design without overlapping */}
          <div className="mt-8">
            <form onSubmit={handleSubmit} className="relative">
              {/* Hidden file input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden"
              />
              
              {/* File preview area */}
              {filePreview && (
                <div className={`mb-4 p-4 rounded-2xl ${isDarkMode ? 'bg-gray-800/80' : 'bg-gray-100'} relative shadow-md`}>
                  <button 
                    type="button" 
                    onClick={clearSelectedFile}
                    className={`absolute top-3 right-3 p-1.5 rounded-full ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'} transition-colors`}
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
              
              {/* ChatGPT-style input container */}
              <div className={`rounded-2xl shadow-lg overflow-hidden ${
                isDarkMode 
                  ? 'bg-gray-800/90 border border-white/10' 
                  : 'bg-white shadow-md'
              }`}>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={selectedFile ? "Add any additional instructions..." : "Input -> Aesthetic Notes"}
                    className={`w-full p-4 resize-none overflow-y-auto focus:outline-none border-0 ${
                      isDarkMode 
                        ? 'bg-transparent text-white scrollbar-dark' 
                        : 'bg-transparent text-gray-900 scrollbar-light'
                    } min-h-[44px] max-h-[200px]`}
                  ></textarea>
                </div>
                
                {/* Bottom toolbar for file upload options and send button */}
                <div className={`flex items-center justify-between px-3 py-2 ${
                  isDarkMode ? '' : ''
                }`}>
                  {/* Left side - file upload buttons */}
                  <div className="flex gap-1">
                    <button 
                      type="button" 
                      className={`p-2 rounded-full transition-transform hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}
                      title="Upload document (PDF, TXT)"
                      onClick={() => triggerFileInput('application/pdf,text/plain')}
                    >
                      <HiOutlineDocumentText className="h-5 w-5" />
                    </button>
                    <button 
                      type="button" 
                      className={`p-2 rounded-full transition-transform hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}
                      title="Upload image"
                      onClick={() => triggerFileInput('image/*')}
                    >
                      <FiImage className="h-5 w-5" />
                    </button>
                    <button 
                      type="button" 
                      className={`p-2 rounded-full transition-transform hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}
                      title="Upload audio/video"
                      onClick={() => triggerFileInput('audio/*,video/*')}
                    >
                      <HiOutlineVolumeUp className="h-5 w-5" />
                    </button>
                  </div>
                  
                  {/* Right side - send button */}
                  <button 
                    type="submit" 
                    disabled={(!inputText.trim() && !selectedFile) || processing}
                    className={`p-2.5 rounded-full transition-all ${
                      (inputText.trim() || selectedFile) && !processing
                        ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80' 
                        : `${isDarkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'}`
                    } flex items-center justify-center w-9 h-9`}
                  >
                    {processing ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <FiSend className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error display */}
              {error && (
                <div className={`mt-6 p-4 rounded-2xl ${
                  isDarkMode ? 'bg-red-900/30 text-red-200 border border-red-500/30' : 'bg-red-50 text-red-700'
                }`}>
                  <p>{error}</p>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
