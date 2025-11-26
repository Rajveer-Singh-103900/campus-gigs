import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, 
  onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  PlusCircle, MapPin, DollarSign, Clock, User, LogOut, Briefcase, Trash2, 
  Loader2, Sparkles, Wand2, X 
} from 'lucide-react';

// --- GEMINI API SETUP ---
// Leave this empty if you don't have a Gemini Key yet, the app will still work (just without AI)
const apiKey = "AIzaSyADpSkuU4M0Uk_5OPmSiACvylZ4GuG_7Ng"; 

const callGemini = async (prompt) => {
  if (!apiKey) return "AI Key missing.";
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate text.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error contacting AI.";
  }
};

// --- PASTE YOUR FIREBASE CONFIG HERE ---
// Delete the lines below and paste your config from the Firebase Console
const firebaseConfig = {
apiKey: "AIzaSyA9gOiem_WQ-Q6HDgi3lir9wHmC5qyRyi0",
    authDomain: "campus-gigs-2025.firebaseapp.com",
    projectId: "campus-gigs-2025",
    storageBucket: "campus-gigs-2025.firebasestorage.app",
    messagingSenderId: "754098613110",
    appId: "1:754098613110:web:0fd9cb1d2afc431c746857",
    measurementId: "G-6Y44M1ELTE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "campus-gigs-local"; // Local app ID

// --- MAIN COMPONENT ---
export default function CampusGigs() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('feed'); 
  const [gigs, setGigs] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [pulseSummary, setPulseSummary] = useState('');
  const [newGig, setNewGig] = useState({ title: '', description: '', reward: '', location: '' });

  // 1. Initialize Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
         await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth failed", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      const savedName = localStorage.getItem('campusGigs_username');
      if (savedName) {
        setUsername(savedName);
        setHasJoined(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Listener
  useEffect(() => {
    if (!user) return;
    const gigsRef = collection(db, 'gigs'); // Simplified path for local use
    const unsubscribe = onSnapshot(gigsRef, (snapshot) => {
      const gigsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      gigsData.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });
      setGigs(gigsData);
    });
    return () => unsubscribe();
  }, [user]);

  // --- ACTIONS ---
  const handleJoin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    localStorage.setItem('campusGigs_username', username);
    setHasJoined(true);
  };

  const handleMagicDraft = async () => {
    if (!newGig.title) return;
    setAiLoading(true);
    const prompt = `Write a short description for a campus task: "${newGig.title}".`;
    const result = await callGemini(prompt);
    setNewGig(prev => ({ ...prev, description: result }));
    setAiLoading(false);
  };

  const handleCampusPulse = async () => {
    setAiLoading(true);
    const openGigTitles = gigs.filter(g => g.status === 'OPEN').map(g => g.title).join(", ");
    if (!openGigTitles) {
      setPulseSummary("It's quiet on campus right now!");
      setAiLoading(false); return;
    }
    const prompt = `Summarize the campus vibe based on these tasks: [${openGigTitles}].`;
    const result = await callGemini(prompt);
    setPulseSummary(result);
    setAiLoading(false);
  };

  const handlePostGig = async (e) => {
    e.preventDefault();
    if (!newGig.title || !newGig.reward) return;
    try {
      await addDoc(collection(db, 'gigs'), {
        ...newGig,
        createdBy: user.uid,
        creatorName: username,
        createdAt: serverTimestamp(),
        status: 'OPEN',
        claimedBy: null, claimedByName: null
      });
      setView('feed');
      setNewGig({ title: '', description: '', reward: '', location: '' });
    } catch (error) { console.error("Error posting:", error); }
  };

  const handleClaimGig = async (gigId) => {
    try {
      await updateDoc(doc(db, 'gigs', gigId), { status: 'IN_PROGRESS', claimedBy: user.uid, claimedByName: username });
    } catch (error) { console.error("Error claiming:", error); }
  };

  const handleCompleteGig = async (gigId) => {
    try {
      await updateDoc(doc(db, 'gigs', gigId), { status: 'COMPLETED' });
    } catch (error) { console.error("Error completing:", error); }
  };

  const handleDeleteGig = async (gigId) => {
    try { await deleteDoc(doc(db, 'gigs', gigId)); } catch (error) { console.error("Error deleting:", error); }
  };

  const handleLogout = () => {
    localStorage.removeItem('campusGigs_username');
    setHasJoined(false); setUsername('');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800 border-green-200';
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'COMPLETED': return 'bg-gray-100 text-gray-500 border-gray-200';
      default: return 'bg-gray-100';
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600"/></div>;

  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-md text-center">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Briefcase className="w-8 h-8 text-indigo-600"/></div>
          <h1 className="text-3xl font-bold mb-8">CampusGigs</h1>
          <form onSubmit={handleJoin} className="space-y-4">
            <input type="text" placeholder="Your Name" required className="w-full px-4 py-3 border rounded-lg" value={username} onChange={e => setUsername(e.target.value)} />
            <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold">Enter Campus</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white shadow sticky top-0 z-10 p-4 flex justify-between">
        <div className="flex gap-2 font-bold text-xl cursor-pointer" onClick={() => setView('feed')}><Briefcase className="text-indigo-600"/> CampusGigs</div>
        <div className="flex gap-2 bg-gray-100 px-3 py-1 rounded-full cursor-pointer" onClick={() => setView('profile')}><User className="w-5 h-5"/> {username}</div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {view === 'feed' && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <h2 className="text-lg font-bold">Latest Gigs</h2>
              <div className="flex gap-2">
                <button onClick={handleCampusPulse} disabled={aiLoading} className="bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-sm flex gap-2 items-center">
                  {aiLoading && !newGig.title ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Pulse
                </button>
                <button onClick={() => setView('post')} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex gap-2"><PlusCircle className="w-4 h-4"/> Post</button>
              </div>
            </div>
            {pulseSummary && <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl relative"><button onClick={() => setPulseSummary('')} className="absolute top-2 right-2"><X className="w-4 h-4 text-gray-400"/></button><h3 className="font-bold text-purple-800 text-sm">AI Pulse</h3><p className="text-sm">{pulseSummary}</p></div>}
            {gigs.map(gig => (
              <div key={gig.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getStatusColor(gig.status)}`}>{gig.status.replace('_', ' ')}</span>
                  <span className="flex items-center gap-1 font-bold text-green-600"><DollarSign className="w-4 h-4"/> {gig.reward}</span>
                </div>
                <h3 className="font-bold text-lg">{gig.title}</h3>
                <p className="text-gray-600 text-sm mb-4">{gig.description}</p>
                <div className="flex gap-2 border-t pt-3">
                  {gig.createdBy === user.uid ? (
                    <>
                      {gig.status !== 'COMPLETED' && <button onClick={() => handleCompleteGig(gig.id)} className="flex-1 bg-green-50 text-green-700 py-2 rounded-lg text-sm font-bold">Complete</button>}
                      <button onClick={() => handleDeleteGig(gig.id)} className="px-3 bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                    </>
                  ) : gig.status === 'OPEN' ? (
                    <button onClick={() => handleClaimGig(gig.id)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold">I'll Do It</button>
                  ) : (
                    <div className="flex-1 bg-gray-100 text-gray-500 py-2 rounded-lg text-sm font-bold text-center">{gig.status === 'COMPLETED' ? 'Done' : 'Taken'}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'post' && (
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-xl font-bold mb-6">Post Gig</h2>
            <form onSubmit={handlePostGig} className="space-y-4">
              <input type="text" placeholder="Title" className="w-full px-4 py-2 border rounded-lg" value={newGig.title} onChange={e => setNewGig({...newGig, title: e.target.value})} required/>
              <div>
                <div className="flex justify-between mb-1"><label className="text-sm font-medium">Description</label><button type="button" onClick={handleMagicDraft} className="text-xs text-purple-600 font-bold flex gap-1 items-center">{aiLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>} Magic Draft</button></div>
                <textarea rows="3" className="w-full px-4 py-2 border rounded-lg" value={newGig.description} onChange={e => setNewGig({...newGig, description: e.target.value})}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Reward (e.g. 50)" className="w-full px-4 py-2 border rounded-lg" value={newGig.reward} onChange={e => setNewGig({...newGig, reward: e.target.value})} required/>
                <input type="text" placeholder="Location" className="w-full px-4 py-2 border rounded-lg" value={newGig.location} onChange={e => setNewGig({...newGig, location: e.target.value})}/>
              </div>
              <div className="flex gap-2"><button type="button" onClick={() => setView('feed')} className="flex-1 border py-2 rounded-lg">Cancel</button><button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold">Post</button></div>
            </form>
          </div>
        )}

        {view === 'profile' && (
           <div className="bg-white p-6 rounded-xl text-center">
             <div className="w-20 h-20 bg-indigo-100 rounded-full mx-auto mb-4 flex items-center justify-center"><User className="w-10 h-10 text-indigo-600"/></div>
             <h2 className="text-2xl font-bold">{username}</h2>
             <button onClick={handleLogout} className="mt-8 text-red-500 flex items-center justify-center gap-2 mx-auto"><LogOut className="w-4 h-4"/> Sign Out</button>
           </div>
        )}
      </main>
    </div>
  );
}