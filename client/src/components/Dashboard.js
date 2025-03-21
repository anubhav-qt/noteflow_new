import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useTheme } from '../contexts/ThemeContext';
import { FiSun, FiMoon, FiHome, FiLogOut, FiEdit } from 'react-icons/fi';
import NavBar from './NavBar';

function Dashboard({ user }) {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

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
      const q = query(collection(db, 'notes'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const notesList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotes(notesList);
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
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
        {/* Replace the existing header with the NavBar component */}
        <NavBar user={user} />
        
        {/* Rest of the dashboard content */}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {notes.map(note => (
                  <div 
                    key={note.id} 
                    className={`rounded-lg p-6 transition-all duration-300 hover:shadow-lg ${
                      isDarkMode 
                        ? 'bg-gray-800/70 hover:bg-gray-750/70 border border-white/10' 
                        : 'bg-white hover:shadow-xl'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-medium mb-2">
                        Note {new Date(note.createdAt).toLocaleDateString()}
                      </h3>
                      <button 
                        className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                        title="Edit note"
                      >
                        <FiEdit className="h-4 w-4" />
                      </button>
                    </div>
                    <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Type: {note.inputType}
                    </p>
                    <div className="flex justify-between mt-4">
                      <a 
                        href={note.processedNoteUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className={`text-sm font-medium ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                      >
                        View Note
                      </a>
                      <a 
                        href={note.processedNoteUrl} 
                        download
                        className={`text-sm font-medium ${isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'}`}
                      >
                        Download PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
