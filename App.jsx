import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, Navigation, Loader2, Save, Trash2, Globe, 
  History, Satellite, Cpu, RefreshCw, AlertTriangle, CheckCircle, 
  Usb, Wifi, WifiOff, Map as MapIcon, Terminal, Sun, Moon 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

// --- MAP IMPORTS: LEAFLET (FREE) ---
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- FIX: LEAFLET ICON PATH ISSUE (Using stable CDN for marker) ---
let DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
// --- END FIX ---

// --- YOUR VERIFIED FIREBASE CONFIG (sarge-4586f) ---
const firebaseConfig = {
  apiKey: "AIzaSyBpqTdsFsuuwYYCE-w0l_op-4tnx-Cy1R0", 
  authDomain: "sarge-4586f.firebaseapp.com",
  projectId: "sarge-4586f",
  storageBucket: "sarge-4586f.firebasestorage.app",
  messagingSenderId: "206412196142",
  appId: "1:206412196142:web:02db23e622a3b1376cb2bf",
  measurementId: "G-GS0VHYJBGR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'my-gps-tracker'; 

const defaultCenter = [14.5995, 120.9842]; // Manila Coordinates

// List of Batangas Locations for filtering
const BATANGAS_LOCATIONS = [
  'All Locations', 'Lipa', 'Batangas City', 'San Jose', 
  'Lemery', 'Bauan', 'Lobo', 'San Pascual', 'Taysan'
];

// --- HELPER COMPONENT TO RE-CENTER MAP ---
function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);
  return null;
}

// --- LOGO SVG COMPONENT (Customized for Theme and Size) ---
const SargeLogo = ({ theme }) => {
  const isDark = theme === 'dark';
  const color = isDark ? 'white' : '#1f2937'; // White or Slate-800
  const red = '#b91c1c'; // Tailwind red-700
  
  return (
    <div className="flex items-center gap-4">
      {/* Red Dot Graphic (Matches your upload) */}
      <div className="relative w-8 h-8 flex items-center justify-center">
         {/* Outer Arc (Stylized) */}
         <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 4C9.37258 4 4 9.37258 4 16" stroke={color} strokeWidth="4" strokeLinecap="round"/>
            <path d="M28 16C28 22.6274 22.6274 28 16 28" stroke={color} strokeWidth="4" strokeLinecap="round"/>
            <circle cx="16" cy="16" r="6" fill={red} />
         </svg>
      </div>
      
      <svg width="150" height="30" viewBox="0 0 150 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Note: The font is loaded via index.css */}
        <text x="0" y="24" fontFamily="'Space Surfer', sans-serif" fontSize="24" fontWeight="bold" fill={color}>SARGE</text>
      </svg>
    </div>
  );
};


// --- THEME CLASS HELPER ---
const getThemeClasses = (theme) => {
  const isDark = theme === 'dark';
  return {
    // General Colors
    bgPrimary: isDark ? 'bg-slate-950' : 'bg-white',
    bgSecondary: isDark ? 'bg-slate-900' : 'bg-slate-100',
    textPrimary: isDark ? 'text-slate-300' : 'text-slate-900',
    textSecondary: isDark ? 'text-slate-500' : 'text-slate-600',
    borderPrimary: isDark ? 'border-slate-800' : 'border-slate-300',
    
    // Card/Box Colors
    cardBg: isDark ? 'bg-slate-900' : 'bg-white',
    cardBorder: isDark ? 'border-slate-800' : 'border-slate-200',
    
    // Map/Serial Box Colors
    serialBg: isDark ? 'bg-black border-slate-800' : 'bg-slate-50 border-slate-300',
    serialText: isDark ? 'text-emerald-500' : 'text-slate-800',
    
    // Logo Container Colors
    logoContainer: isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
  };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [port, setPort] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [serialData, setSerialData] = useState("");
  const [status, setStatus] = useState("Ready to Connect");
  // Debug state to show exact errors on screen
  const [debugMsg, setDebugMsg] = useState("System Idle");
  const [lastLat, setLastLat] = useState(null);
  const [lastLng, setLastLng] = useState(null);
  const [theme, setTheme] = useState('dark'); // Initial State: dark
  const [locationFilter, setLocationFilter] = useState('All Locations'); // New Filter State
  
  const T = getThemeClasses(theme); // Theme Classes Object

  // --- FILTERED LOGS ---
  const filteredLogs = useMemo(() => {
    if (locationFilter === 'All Locations') {
      return logs;
    }
    const filterTerm = locationFilter.replace(' City', '').toLowerCase();
    
    // Filter by checking if the location is contained within the address string
    return logs.filter(log => 
      log.address && log.address.toLowerCase().includes(filterTerm)
    );
  }, [logs, locationFilter]);


  // Auth
  useEffect(() => {
    const initAuth = async () => { 
      try {
        await signInAnonymously(auth); 
        setDebugMsg("Auth Success!");
      } catch (e) {
        setDebugMsg("Auth Error: " + e.message);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // Data Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error(error);
      setDebugMsg("Database Read Error: Permission Denied?");
    });
    return () => unsubscribe();
  }, [user]);

  // --- SERIAL CONNECTION ---
  const connectSerial = async () => {
    if (!navigator.serial) { alert("Web Serial not supported."); return; return; }
    try {
      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsReading(true);
      setStatus("Receiver Connected");
      readLoop(selectedPort);
    } catch (error) {
      setStatus("Connection Failed");
    }
  };

  const readLoop = async (currentPort) => {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = currentPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop(); 
        for (const line of lines) { processSerialLine(line.trim()); }
      }
    } catch (error) { setDebugMsg("Serial Read Error"); } 
    finally { reader.releaseLock(); }
  };

  // --- HYBRID PARSER ---
  const processSerialLine = async (line) => {
    if (!line) return;
    setSerialData(line); 

    let newLat = null;
    let newLng = null;
    let rssi = 0;
    
    // Robust Parsing Logic (from previous steps)
    const latMatch = line.match(/Lat:?\s*(-?\d+\.\d+)/i);
    const lngMatch = line.match(/Lng:?\s*(-?\d+\.\d+)/i);
    const rssiMatch = line.match(/RSSI\s+(-?\d+)/i);

    if (latMatch && lngMatch) {
      newLat = parseFloat(latMatch[1]);
      newLng = parseFloat(lngMatch[1]);
      rssi = rssiMatch ? parseInt(rssiMatch[1]) : 0;
    }

    if (newLat !== null && newLng !== null) {
      setDebugMsg(`Parsing Success: ${newLat}, ${newLng} | Saving...`);
      
      await saveToFirestore({ lat: newLat, lng: newLng, rssi: rssi, status: "Active Tracking", source: "LoRa Receiver" });
    } 
    else if (line.includes("Searching")) {
       setStatus("Remote: Searching for GPS...");
    } else {
       if(!line.includes("Initialized") && line.length > 5 && !line.includes("Waiting")) {
         setDebugMsg("Parsing Failed: Unknown Format");
       }
    }
  };

  const saveToFirestore = async (data) => {
    if (!user) { setDebugMsg("Save Failed: No User Logged In"); return; }
    
    let address = "Unknown / No Signal";
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}&zoom=18`);
      const geo = await res.json();
      address = geo.display_name || "Unknown Location";
    } catch (e) { address = "Address lookup failed"; }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), { ...data, address: address, timestamp: Date.now() });
      setDebugMsg("Saved to Database Successfully!");
    } catch (e) {
      console.error(e);
      setDebugMsg(`FIREBASE SAVE ERROR: ${e.message}`); 
    }
  };

  const handleDelete = async (id) => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'gps_logs', id));

  const centerCoords = filteredLogs.length > 0 ? [filteredLogs[0].lat, filteredLogs[0].lng] : defaultCenter;
  
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={`min-h-screen ${T.bgPrimary} p-4 md:p-8 font-sans ${T.textPrimary}`}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LOGO HEADER (Matching Sketch) */}
        <div className={`lg:col-span-3 mb-4 p-4 rounded-2xl shadow-xl border ${T.logoContainer} flex justify-between items-center`}>
            <SargeLogo theme={theme} />
            {/* Theme Toggle Button (Placed here for high visibility near the logo) */}
            <button 
                onClick={toggleTheme}
                className={`p-3 rounded-full transition-colors duration-300 shadow-md ${theme === 'dark' ? 'bg-slate-800 text-yellow-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                title="Toggle Theme"
            >
                {theme === 'dark' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
            </button>
        </div>
        
        {/* Left Panel - Receiver Link */}
        <div className="space-y-6">
          <div className={`${T.cardBg} p-6 rounded-2xl shadow-xl border ${T.cardBorder}`}>
            
            {/* Receiver Link Header */}
            <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-600 rounded-lg"><Usb className="text-white w-6 h-6" /></div>
                  <div>
                    <h1 className={`text-xl font-bold ${T.textPrimary}`}>Receiver Link</h1>
                    <p className={`text-xs ${T.textSecondary}`}>{status}</p>
                  </div>
            </div>
            
            {!isReading ? (
              <button onClick={connectSerial} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/20">
                <Usb className="w-4 h-4" /> Connect to Receiver
              </button>
            ) : (
              <div className="p-3 bg-emerald-900/30 border border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-400">
                <Wifi className="w-5 h-5 animate-pulse" /> <span className="text-sm font-medium">Reading LoRa Data...</span>
              </div>
            )}
            
            {/* DEBUG STATUS BOX */}
            <div className={`mt-4 p-3 rounded-lg border flex items-center gap-2 ${debugMsg.startsWith('FIREBASE SAVE ERROR') || debugMsg.includes('Auth Error') || debugMsg.includes('Failed') ? 'bg-red-900/30 border-red-700 text-red-300' : `${T.bgSecondary} ${T.borderPrimary} text-yellow-200`}`}>
                <Terminal className={`w-4 h-4 ${debugMsg.startsWith('FIREBASE') ? 'text-red-500' : 'text-yellow-500'}`} />
                <span className={`text-xs font-mono break-all ${T.textSecondary}`}>{debugMsg}</span>
            </div>

            <div className="mt-4">
              <label className={`text-xs font-bold ${T.textSecondary} uppercase tracking-wider`}>Live Serial Feed</label>
              <div className={`mt-2 p-3 ${T.serialBg} font-mono text-xs rounded-lg h-32 overflow-hidden relative break-all shadow-inner ${T.serialText}`}>
                {serialData || "> Waiting for packets..."}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Map & Logs */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`${T.cardBg} rounded-2xl shadow-xl border ${T.cardBorder} overflow-hidden h-[400px] relative z-0`}>
             <div className={`absolute top-4 right-4 z-[400] ${T.bgSecondary}/80 backdrop-blur p-2 rounded-lg border ${T.cardBorder} text-xs font-bold ${T.textPrimary} shadow-sm flex items-center gap-2`}>
                <MapIcon className="w-4 h-4 text-blue-400" /> Live Tracking
             </div>
             
             {/* Map Container for Leaflet */}
             <MapContainer center={centerCoords} zoom={15} style={{ height: "100%", width: "100%" }} key={filteredLogs.length}>
                {/* Free OpenStreetMap Tiles */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {/* Auto-center map when logs change */}
                {filteredLogs.length > 0 && <RecenterMap lat={centerCoords[0]} lng={centerCoords[1]} />}

                {/* Render markers for logs */}
                {filteredLogs.map((log) => (
                  (log.lat !== 0 && log.lng !== 0 && !isNaN(log.lat)) && (
                    <Marker key={log.id} position={[log.lat, log.lng]}>
                      <Popup>
                        <div className={`text-slate-800 text-xs font-bold`}>
                          {log.address} <br/> <span className="text-slate-500 font-mono">{log.lat.toFixed(5)}, {log.lng.toFixed(5)}</span>
                        </div>
                      </Popup>
                    </Marker>
                  )
                ))}
             </MapContainer>

          </div>

          <div className={`${T.cardBg} rounded-2xl shadow-xl border ${T.cardBorder} h-[400px] flex flex-col`}>
            <div className={`p-6 border-b ${T.cardBorder} flex justify-between items-center`}>
              
              <h2 className={`text-lg font-bold ${T.textPrimary} flex items-center gap-2`}><History className="w-5 h-5 text-blue-500" /> Live Feed</h2>
              
              {/* Location Filter Dropdown */}
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className={`py-1 px-3 text-sm rounded-lg shadow-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-colors
                  ${T.bgSecondary} ${T.textPrimary} ${T.cardBorder} border`}
              >
                {BATANGAS_LOCATIONS.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
              
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${T.cardBorder} ${T.bgSecondary} ${T.textPrimary}`}>{filteredLogs.length} Records</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {filteredLogs.length === 0 ? (
                <div className={`h-full flex flex-col items-center justify-center ${T.textSecondary} opacity-50`}>
                  <Satellite className="w-16 h-16 mb-4" /><p>
                    {locationFilter === 'All Locations' 
                      ? "Waiting for LoRa signal..." 
                      : `No data found for ${locationFilter}`
                    }
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className={`relative flex gap-4 p-4 rounded-xl border ${T.bgSecondary}/50 ${T.cardBorder} hover:border-blue-500/50 transition group`}>
                    <div className={`p-3 rounded-lg h-fit ${T.bgSecondary} text-blue-400 border ${T.cardBorder}`}><MapPin className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-bold ${T.textSecondary} uppercase`}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={`px-2 py-0.5 ${T.bgSecondary} border ${T.cardBorder} rounded text-[10px] font-mono ${T.textSecondary} shrink-0`}>RSSI: {log.rssi} dBm</span>
                      </div>
                      <h3 className={`font-bold ${T.textPrimary} text-sm leading-tight break-words`} title={log.address}>{log.address}</h3>
                      <div className={`text-xs ${T.textSecondary} font-mono mt-1`}>{log.lat.toFixed(6)}, {log.lng.toFixed(6)}</div>
                    </div>
                    <button onClick={() => handleDelete(log.id)} className="text-slate-600 hover:text-red-400 transition self-center opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
