import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, Navigation, Loader2, Save, Trash2, Globe, 
  History, Satellite, Cpu, RefreshCw, AlertTriangle, CheckCircle, 
  Usb, Wifi, WifiOff, Map as MapIcon, Terminal, Sun, Moon,
  Mail, Phone, FileText, Users, MapPinned, ChevronDown
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

// --- MAP IMPORTS: LEAFLET (FREE) ---
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- FIX: LEAFLET ICON PATH ISSUE ---
let DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

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

const defaultCenter = [13.7565, 121.0583]; // Batangas City

// --- ENHANCED BATANGAS LOCATIONS LIST ---
const BATANGAS_LOCATIONS = [
  { name: 'All Locations', coords: [13.7565, 121.0583] }, 
  { name: 'Batangas City', coords: [13.7565, 121.0583] },
  { name: 'Lipa City', coords: [13.9411, 121.1643] },
  { name: 'Tanauan City', coords: [14.0854, 121.1496] },
  { name: 'Taal', coords: [13.8828, 120.9287] },
  { name: 'Lemery', coords: [13.9169, 120.8928] },
  { name: 'Bauan', coords: [13.7933, 121.0094] },
  { name: 'San Pascual', coords: [13.8089, 121.0297] },
  { name: 'Lobo', coords: [13.6536, 121.2428] },
  { name: 'Taysan', coords: [13.7706, 121.2111] },
  { name: 'San Jose', coords: [13.8808, 121.0886] },
  { name: 'Balayan', coords: [13.9576, 120.7303] },
  { name: 'Calaca', coords: [13.9525, 120.8406] },
  { name: 'Nasugbu', coords: [14.0759, 120.6384] },
  { name: 'Talisay', coords: [14.0537, 121.0264] }
];

// --- HELPER COMPONENT TO RE-CENTER MAP ---
function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      // Use setView with animation for smooth flyover
      map.setView([lat, lng], 13, { animate: true, duration: 1 });
    }
  }, [lat, lng, map]);
  return null;
}

// --- LOGO SVG COMPONENT (The most stable version) ---
const SargeLogo = ({ theme }) => {
  const isDark = theme === 'dark';
  const color = isDark ? 'white' : '#1f2937'; 
  const red = '#b91c1c'; 
  
  return (
    <div className="flex items-center gap-4">
      {/* Red Square Graphic */}
      <div style={{ backgroundColor: red }} className="w-6 h-6 mr-1 rounded-sm shadow-md"></div>
      
      <svg width="150" height="30" viewBox="0 0 150 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="24" fontFamily="'Space Surfer', sans-serif" fontSize="26" fontWeight="900" fill={color}>SARGE</text>
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
  const [locationFilter, setLocationFilter] = useState('All Locations'); // Filter State (Name)
  const [selectedLocation, setSelectedLocation] = useState(BATANGAS_LOCATIONS[0]); // Filter State (Coords)
  
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


  // Handle location selection with smooth animation
  const handleLocationChange = (location) => {
    setLocationFilter(location.name);
    setSelectedLocation(location);
  };
  
  // Determine map center based on filter or latest log
  const currentCenter = selectedLocation.name === 'All Locations' && filteredLogs.length > 0
    ? [filteredLogs[0].lat, filteredLogs[0].lng]
    : selectedLocation.coords;

  const centerCoords = currentCenter;

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={`min-h-screen ${T.bgPrimary} font-sans ${T.textPrimary} transition-colors duration-300 flex flex-col`}>
      <div className="p-4 md:p-8 flex-grow">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LOGO HEADER */}
          <div className={`lg:col-span-3 mb-4 p-4 rounded-2xl shadow-xl border ${T.logoContainer} flex justify-between items-center transition-all duration-300`}>
              <SargeLogo theme={theme} />
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
            <div className={`${T.cardBg} p-6 rounded-2xl shadow-xl border ${T.cardBorder} transition-all duration-300`}>
              
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
            
            {/* LOCATION FILTER PANEL (Enhanced Dropdown) */}
            <div className={`${T.cardBg} p-4 rounded-2xl shadow-xl border ${T.cardBorder} transition-all duration-300`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <MapPinned className="w-5 h-5 text-blue-500" />
                  <span className={`text-sm font-bold ${T.textPrimary}`}>Viewing Area:</span>
                </div>
                
                <div className="relative">
                  <select
                    value={locationFilter}
                    onChange={(e) => handleLocationChange(BATANGAS_LOCATIONS.find(loc => loc.name === e.target.value))}
                    className={`py-1 px-3 text-sm rounded-lg shadow-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer
                      ${T.bgSecondary} ${T.textPrimary} ${T.cardBorder} border appearance-none pr-8`}
                  >
                    {BATANGAS_LOCATIONS.map(loc => (
                      <option key={loc.name} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none text-blue-500" />
                </div>
              </div>
            </div>

            {/* MAP WITH LOCATION FILTERING */}
            <div className={`${T.cardBg} rounded-2xl shadow-xl border ${T.cardBorder} overflow-hidden h-[400px] relative z-0 transition-all duration-300`}>
              <div className={`absolute top-4 right-4 z-[400] ${T.bgSecondary}/90 backdrop-blur-sm p-2 rounded-lg border ${T.cardBorder} text-xs font-bold ${T.textPrimary} shadow-lg flex items-center gap-2`}>
                <MapIcon className="w-4 h-4 text-blue-400" /> 
                {locationFilter}
              </div>
              
              <MapContainer 
                center={centerCoords} 
                zoom={13} 
                style={{ height: "100%", width: "100%" }} 
                key={`${centerCoords[0]}-${centerCoords[1]}`} // Key ensures map re-renders on center change
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                <RecenterMap lat={centerCoords[0]} lng={centerCoords[1]} />

                {filteredLogs.map((log) => (
                  (log.lat !== 0 && log.lng !== 0 && !isNaN(log.lat)) && (
                    <Marker key={log.id} position={[log.lat, log.lng]}>
                      <Popup>
                        <div className="text-slate-800 text-xs font-bold">
                          {log.address} <br/> 
                          <span className="text-slate-500 font-mono">{log.lat.toFixed(6)}, {log.lng.toFixed(6)}</span>
                        </div>
                      </Popup>
                    </Marker>
                  )
                ))}
              </MapContainer>
            </div>

            {/* LOGS SECTION */}
            <div className={`${T.cardBg} rounded-2xl shadow-xl border ${T.cardBorder} h-[400px] flex flex-col transition-all duration-300`}>
              <div className={`p-6 border-b ${T.cardBorder} flex justify-between items-center`}>
                <h2 className={`text-lg font-bold ${T.textPrimary} flex items-center gap-2`}><History className="w-5 h-5 text-blue-500" /> Live Feed</h2>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${T.cardBorder} bg-blue-500/10 text-blue-500`}>
                  {filteredLogs.length} Records
                </span>
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
                    <div 
                      key={log.id} 
                      className={`relative flex gap-4 p-4 rounded-xl border ${T.bgSecondary}/50 ${T.cardBorder} hover:border-blue-500/50 transition-all duration-300 group hover:shadow-lg`}
                    >
                      <div className={`p-3 rounded-lg h-fit bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg`}>
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-xs font-bold ${T.textSecondary} uppercase`}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={`px-2 py-0.5 ${T.bgSecondary} border ${T.cardBorder} rounded text-[10px] font-mono ${T.textSecondary} shrink-0`}>
                            RSSI: {log.rssi} dBm
                          </span>
                        </div>
                        <h3 className={`font-bold ${T.textPrimary} text-sm leading-tight break-words`} title={log.address}>
                          {log.address}
                        </h3>
                        <div className={`text-xs ${T.textSecondary} font-mono mt-1`}>
                          {log.lat.toFixed(6)}, {log.lng.toFixed(6)}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDelete(log.id)} 
                        className="text-slate-600 hover:text-red-400 transition-all duration-300 self-center opacity-0 group-hover:opacity-100 shrink-0 hover:scale-110"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER SECTION */}
      <footer className={`mt-12 py-10 border-t ${T.borderPrimary} transition-colors duration-300 ${T.footerBg}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            
            {/* Research Paper Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h3 className={`text-lg font-bold ${T.textPrimary}`}>Research Paper</h3>
              </div>
              <p className={`text-sm ${T.textSecondary} leading-relaxed`}>
                Read our comprehensive research on GPS tracking systems using LoRa technology.
              </p>
              <button className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-sm transition-all duration-300 shadow-lg hover:shadow-blue-500/50 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Download Final PDF
              </button>
            </div>

            {/* Meet the Team Section (6 Members: 3 SW, 3 HW) */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h3 className={`text-lg font-bold ${T.textPrimary}`}>Meet the Team</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                
                {/* Software Team (Column 1) */}
                <div className="col-span-1 space-y-2">
                  <p className={`font-semibold ${T.textPrimary} text-sm`}>SW Developer 1</p>
                  <p className={`font-semibold ${T.textPrimary} text-sm`}>SW Developer 2</p>
                  <p className={`font-semibold ${T.textPrimary} text-sm`}>SW Developer 3</p>
                </div>
                
                {/* Hardware Team (Column 2) */}
                <div className="col-span-1 space-y-2">
                  <p className={`font-semibold ${T.textPrimary} text-sm`}>HW Engineer 1</p>
                  <p className={`font-semibold ${T.textPrimary} text-sm`}>HW Engineer 2</p>
                  <p className={`font-semibold ${T.textPrimary} text-sm`}>HW Engineer 3</p>
                </div>
                
              </div>
            </div>

            {/* Contact Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500 rounded-lg">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <h3 className={`text-lg font-bold ${T.textPrimary}`}>Contact Info</h3>
              </div>
              <div className="space-y-2">
                <p className={`text-sm ${T.textSecondary} flex items-center gap-2`}>
                  <Mail className="w-4 h-4 text-blue-400" />
                  [Group Email Address]
                </p>
                <p className={`text-sm ${T.textSecondary} flex items-center gap-2`}>
                  <Phone className="w-4 h-4 text-blue-400" />
                  [Project Contact Number]
                </p>
                <p className={`text-sm ${T.textSecondary}`}>
                  Batangas State University TNEU
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className={`mt-8 pt-6 border-t ${T.borderPrimary} text-center ${T.textSecondary} w-full`}>
            <p className="text-sm font-semibold">
                © {new Date().getFullYear()} **SARGE** GPS Project. All rights reserved.
            </p>
        </div>
      </footer>
      
    </div>
  );
}
