import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { useTheme } from '../contexts/ThemeContext';
import { FiEye, FiDownload, FiTrash2, FiX, FiAlertTriangle } from 'react-icons/fi';
import NavBar from './NavBar';

function Dashboard({ user }) {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/home');
      return;
    }
    
    fetchNotes();
  }, [user, navigate]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      // Query both collections - notes (PDFs saved from the app) and processedNotes (from server uploads)
      const notesQuery = query(
        collection(db, 'notes'), 
        where('userId', '==', user.uid)
      );
      
      const processedNotesQuery = query(
        collection(db, 'processedNotes'), 
        where('userId', '==', user.uid)
      );
      
      // Get both sets of documents
      const [notesSnapshot, processedNotesSnapshot] = await Promise.all([
        getDocs(notesQuery),
        getDocs(processedNotesQuery)
      ]);
      
      // Process cloud-saved PDFs
      const pdfNotesList = [];
      
      for (const doc of notesSnapshot.docs) {
        try {
          const data = doc.data();
          
          // Only add to list if we can generate a valid URL
          if (data.pdfData) {
            const blob = new Blob(
              [Uint8Array.from(atob(data.pdfData), c => c.charCodeAt(0))], 
              { type: 'application/pdf' }
            );
            
            const pdfUrl = URL.createObjectURL(blob);
            
            // Handle different date formats safely
            let createdDate;
            let createdAtFormatted;
            
            try {
              // Handle Firebase timestamp object
              if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                createdDate = data.createdAt.toDate();
              } 
              // Handle ISO string format
              else if (typeof data.createdAt === 'string') {
                createdDate = new Date(data.createdAt);
              } 
              // Handle number timestamp
              else if (typeof data.createdAt === 'number') {
                createdDate = new Date(data.createdAt);
              } 
              // Fallback
              else {
                createdDate = new Date();
              }
              
              createdAtFormatted = createdDate.toLocaleDateString();
            } catch (dateError) {
              createdDate = new Date();
              createdAtFormatted = "Unknown date";
            }
            
            pdfNotesList.push({
              id: doc.id,
              type: 'pdf',
              ...data,
              pdfUrl,
              createdAt: createdDate,
              createdAtFormatted
            });
          }
        } catch (docError) {
          // Continue to next document
        }
      }
      
      // Process uploaded/processed notes
      const processedNotesList = [];
      
      for (const doc of processedNotesSnapshot.docs) {
        try {
          const data = doc.data();
          
          // Handle different date formats safely
          let createdDate;
          let createdAtFormatted;
          
          try {
            // Handle Firebase timestamp object
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
              createdDate = data.createdAt.toDate();
            }
            // Handle ISO string format
            else if (typeof data.createdAt === 'string') {
              createdDate = new Date(data.createdAt);
            }
            // Handle number timestamp
            else if (typeof data.createdAt === 'number') {
              createdDate = new Date(data.createdAt);
            }
            // Fallback
            else {
              createdDate = new Date();
            }
            
            createdAtFormatted = createdDate.toLocaleDateString();
          } catch (dateError) {
            createdDate = new Date();
            createdAtFormatted = "Unknown date";
          }
          
          processedNotesList.push({
            id: doc.id,
            type: 'processed',
            ...data,
            createdAt: createdDate,
            createdAtFormatted
          });
        } catch (docError) {
          // Continue to next document
        }
      }
      
      // Combine both lists
      const allNotes = [...pdfNotesList, ...processedNotesList];
      
      // Sort by created date (newest first)
      allNotes.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date();
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date();
        return dateB - dateA;
      });
      
      setNotes(allNotes);
    } catch (error) {
      setError("Failed to load notes. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewPdf = (pdfUrl) => {
    window.open(pdfUrl, '_blank');
  };

  const handleDownloadPdf = (pdfUrl, title) => {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${title || 'noteflow-document'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Function to prompt delete confirmation
  const promptDelete = (note) => {
    setDeleteConfirm(note);
  };

  // Function to cancel delete
  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  // Function to confirm and execute delete
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      setDeleting(true);
      
      // Determine collection based on note type
      const collection = deleteConfirm.type === 'pdf' ? 'notes' : 'processedNotes';
      
      // Delete from Firestore
      await deleteDoc(doc(db, collection, deleteConfirm.id));
      
      // Remove from state
      setNotes(notes.filter(note => note.id !== deleteConfirm.id));
      
      // Clean up URL objects to prevent memory leaks
      if (deleteConfirm.pdfUrl && deleteConfirm.type === 'pdf') {
        URL.revokeObjectURL(deleteConfirm.pdfUrl);
      }
      
      // Clear confirmation
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting note:', error);
      setError('Failed to delete note. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-2">
        {/* NavBar component */}
        <NavBar user={user} />
        
        {/* Dashboard header */}
        <div className="mb-8 mt-8">
          <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Your Notes</h1>
          <p className={`mt-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            View and manage all your saved notes
          </p>
        </div>
        
        {/* Display error message if any */}
        {error && (
          <div className={`p-4 mb-6 rounded-lg ${isDarkMode ? 'bg-red-900/30 text-red-200' : 'bg-red-50 text-red-700'}`}>
            <p>{error}</p>
          </div>
        )}
        
        {/* Notes content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {notes.length === 0 ? (
              <div className={`text-center py-16 rounded-lg ${
                isDarkMode 
                  ? 'bg-gray-800/70 border border-white/10' 
                  : 'bg-white shadow-lg'
              }`}>
                <p className="text-xl">You haven't created any notes yet.</p>
                <button 
                  onClick={() => navigate('/home')} 
                  className={`mt-4 px-6 py-2 rounded-md ${
                    isDarkMode
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  } text-white`}
                >
                  Create Your First Note
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {notes.map(note => (
                  <div 
                    key={note.id} 
                    className={`relative rounded-xl overflow-hidden transition-all duration-300 transform hover:scale-105 ${
                      isDarkMode 
                        ? 'bg-gray-800/70 hover:bg-gray-750/50 border border-white/5 hover:border-blue-400/30' 
                        : 'bg-white hover:shadow-xl shadow-md'
                    } flex flex-col h-[260px]`}
                  >
                    {/* Decorative diagonal gradient accent in top-right corner */}
                    <div className="absolute -top-4 -right-4 w-16 h-16 rotate-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-md"></div>
                    
                    {/* PDF preview thumbnail */}
                    {note.type === 'pdf' && note.pdfUrl && (
                      <div 
                        className="h-32 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
                        onClick={() => handleViewPdf(note.pdfUrl)}
                      >
                        {/* PDF Icon */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
                          <div className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                          </div>
                          
                          {/* Only show title in the preview (no "Click to view" text) */}
                          <p className={`text-xs mt-2 font-medium text-center line-clamp-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {note.title || `Note ${note.createdAtFormatted}`}
                          </p>
                        </div>
                        
                        {/* Add subtle pattern overlay for visual interest */}
                        <div className="absolute inset-0 opacity-5 pointer-events-none">
                          <div className="w-full h-full" style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 50%)',
                            backgroundSize: '8px 8px'
                          }}></div>
                        </div>
                      </div>
                    )}
                    
                    {/* Note content */}
                    <div className="p-4 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-md font-medium mb-1 line-clamp-2">
                          {note.title || `Note ${note.createdAtFormatted}`}
                        </h3>
                        
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {new Date(note.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit'
                          })}
                        </p>
                      </div>
                      
                      {/* Action buttons - Icons only with tooltips */}
                      <div className="flex justify-end items-center gap-1 mt-4">
                        {note.type === 'pdf' ? (
                          <>
                            <button
                              onClick={() => handleViewPdf(note.pdfUrl)}
                              className={`p-2.5 rounded-full transition-all hover:scale-110 ${
                                isDarkMode 
                                  ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' 
                                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                              }`}
                              title="View PDF"
                            >
                              <FiEye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(note.pdfUrl, note.title)}
                              className={`p-2.5 rounded-full transition-all hover:scale-110 ${
                                isDarkMode 
                                  ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' 
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                              title="Download PDF"
                            >
                              <FiDownload className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <a 
                              href={note.noteUrl || note.processedNoteUrl}
                              target="_blank" 
                              rel="noreferrer"
                              className={`p-2.5 rounded-full transition-all hover:scale-110 ${
                                isDarkMode 
                                  ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' 
                                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                              }`}
                              title="View"
                            >
                              <FiEye className="w-4 h-4" />
                            </a>
                            <a 
                              href={note.noteUrl || note.processedNoteUrl}
                              download
                              className={`p-2.5 rounded-full transition-all hover:scale-110 ${
                                isDarkMode 
                                  ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' 
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                              title="Download"
                            >
                              <FiDownload className="w-4 h-4" />
                            </a>
                          </>
                        )}
                        
                        {/* Delete button */}
                        <button
                          onClick={() => promptDelete(note)}
                          className={`p-2.5 rounded-full transition-all hover:scale-110 ${
                            isDarkMode 
                              ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20' 
                              : 'bg-red-50 text-red-500 hover:bg-red-100'
                          }`}
                          title="Delete note"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Animated pseudo-element on hover */}
                    <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br opacity-0 hover:opacity-10 transition-opacity duration-300 ${
                      isDarkMode 
                        ? 'from-blue-400 to-purple-600' 
                        : 'from-blue-500 to-purple-700'
                    }`}></div>
                    
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        
        {/* Delete confirmation modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className={`max-w-md w-full p-6 rounded-lg shadow-lg ${
              isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
            }`}>
              <div className="flex items-center mb-4">
                <FiAlertTriangle className={`w-6 h-6 mr-2 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
                <h3 className="text-lg font-bold">Delete Note</h3>
              </div>
              
              <p className="mb-6">
                Are you sure you want to delete "{deleteConfirm.title || `Note ${deleteConfirm.createdAtFormatted}`}"? 
                This action cannot be undone.
              </p>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelDelete}
                  className={`px-4 py-2 rounded-md ${
                    isDarkMode 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  disabled={deleting}
                >
                  Cancel
                </button>
                
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={deleting}
                >
                  {deleting ? (
                    <div className="flex items-center">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Deleting...
                    </div>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
