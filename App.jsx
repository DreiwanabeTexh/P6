import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
MapPin, Navigation, Loader2, Save, Trash2, Globe,
History, Satellite, Cpu, RefreshCw, AlertTriangle, CheckCircle,
Usb, Wifi, WifiOff, Map as MapIcon, Terminal
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

// --- YOUR FIREBASE CONFIG (Required for database saving) ---
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

// --- HELPER COMPONENT TO RE-CENTER MAP ---
// This component automatically flies the map to the new location when it updates
function RecenterMap({ lat, lng }) {
const map = useMap();
useEffect(() => {
if (lat && lng) {
map.setView([lat, lng], map.getZoom());
}
}, [lat, lng, map]);
return null;
}

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
if (!navigator.serial) { alert("Web Serial not supported."); return; }
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

// 1. Try JSON Parsing
if (line.startsWith("JSON:")) {
try {
const jsonStr = line.replace("JSON:", "").trim();
const data = JSON.parse(jsonStr);
if (data.lat && data.lng) {
newLat = parseFloat(data.lat);
newLng = parseFloat(data.lng);
rssi = data.rssi || 0;
}
} catch (e) {
// Ignore JSON error, try Regex next
}
}

// 2. Try Regex Parsing (Matches: "Lat:13.75...,Lng:121.06...")
if (newLat === null) {
const latMatch = line.match(/Lat:?\s*(-?\d+\.\d+)/i);
const lngMatch = line.match(/Lng:?\s*(-?\d+\.\d+)/i);
const rssiMatch = line.match(/RSSI\s+(-?\d+)/i);

if (latMatch && lngMatch) {
newLat = parseFloat(latMatch[1]);
newLng = parseFloat(lngMatch[1]);
rssi = rssiMatch ? parseInt(rssiMatch[1]) : 0;
}
}

// 3. Handle Result
if (newLat !== null && newLng !== null) {
setDebugMsg(`Parsing Success: ${newLat}, ${newLng} | Saving...`);

setLastLat(newLat);
setLastLng(newLng);

await saveToFirestore({
lat: newLat,
lng: newLng,
rssi: rssi,
status: "Active Tracking",
source: "LoRa Receiver"
});
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
if (!user) {
setDebugMsg("Save Failed: No User Logged In");
return;
}

let address = "Unknown / No Signal";
try {
// Use OpenStreetMap Nominatim for free Reverse Geocoding
const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}&zoom=18`);
const geo = await res.json();
address = geo.display_name || "Unknown Location";
} catch (e) { address = "Address lookup failed"; }

try {
await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), {
...data,
address: address,
timestamp: Date.now()
});
setDebugMsg("Saved to Database Successfully!");
} catch (e) {
console.error(e);
// Display the Firebase error message prominently
setDebugMsg(`FIREBASE SAVE ERROR: ${e.message}`);
}
};

const handleDelete = async (id) => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'gps_logs', id));

const centerCoords = logs.length > 0 ? [logs[0].lat, logs[0].lng] : defaultCenter;

return (
<div className="min-h-screen bg-slate-950 p-4 md:p-8 font-sans text-slate-300">
<div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

{/* Left Panel */}
<div className="space-y-6">
<div className="bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
<div className="flex items-center gap-3 mb-4">
<div className="p-2 bg-blue-600 rounded-lg"><Usb className="text-white w-6 h-6" /></div>
<div>
<h1 className="text-xl font-bold text-white">Receiver Link</h1>
<p className="text-xs text-slate-400">{status}</p>
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
<div className={`mt-4 p-3 rounded-lg border flex items-center gap-2 ${debugMsg.startsWith('FIREBASE SAVE ERROR') || debugMsg.includes('Auth Error') || debugMsg.includes('Failed') ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-slate-800 border-slate-700 text-yellow-200'}`}>
<Terminal className="w-4 h-4" />
<span className="text-xs font-mono break-all">{debugMsg}</span>
</div>

<div className="mt-4">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Serial Feed</label>
<div className="mt-2 p-3 bg-black border border-slate-800 text-emerald-500 font-mono text-xs rounded-lg h-32 overflow-hidden relative break-all shadow-inner">
{serialData || "> Waiting for packets..."}
</div>
</div>
</div>
</div>

{/* Right Panel: Map & Logs */}
<div className="lg:col-span-2 space-y-6">
<div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden h-[400px] relative z-0">
<div className="absolute top-4 right-4 z-[400] bg-slate-800/80 backdrop-blur p-2 rounded-lg border border-slate-700 text-xs font-bold text-white shadow-sm flex items-center gap-2">
<MapIcon className="w-4 h-4 text-blue-400" /> Live Tracking
</div>

{/* Map Container for Leaflet */}
<MapContainer center={centerCoords} zoom={15} style={{ height: "100%", width: "100%" }} key={logs.length}>
{/* Free OpenStreetMap Tiles */}
<TileLayer
attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
/>

{/* Auto-center map when logs change */}
{logs.length > 0 && <RecenterMap lat={centerCoords[0]} lng={centerCoords[1]} />}

{/* Render markers for logs */}
{logs.map((log) => (
// Marker Validator: Only draw if lat/lng are valid numbers (not 0, 0)
(log.lat !== 0 && log.lng !== 0 && !isNaN(log.lat)) && (
<Marker key={log.id} position={[log.lat, log.lng]}>
<Popup>
<div className="text-slate-800 text-xs font-bold">
{log.address} <br/> <span className="text-slate-500 font-mono">{log.lat.toFixed(5)}, {log.lng.toFixed(5)}</span>
</div>
</Popup>
</Marker>
)
))}
</MapContainer>

</div>

<div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 h-[400px] flex flex-col">
<div className="p-6 border-b border-slate-800 flex justify-between items-center">
<h2 className="text-lg font-bold text-white flex items-center gap-2"><History className="w-5 h-5 text-blue-500" /> Live Feed</h2>
<span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-bold border border-slate-700">{logs.length} Records</span>
</div>
<div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
{logs.length === 0 ? (
<div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50"><Satellite className="w-16 h-16 mb-4" /><p>Waiting for LoRa signal...</p></div>
) : (
logs.map((log) => (
<div key={log.id} className="relative flex gap-4 p-4 rounded-xl border bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition group">
<div className="p-3 rounded-lg h-fit bg-slate-800 text-blue-400 border border-slate-700"><MapPin className="w-5 h-5" /></div>
<div className="flex-1 min-w-0">
<div className="flex justify-between items-start mb-1">
<span className="text-xs font-bold text-slate-500 uppercase">{new Date(log.timestamp).toLocaleTimeString()}</span>
<span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-400 shrink-0">RSSI: {log.rssi} dBm</span>
</div>
<h3 className="font-bold text-slate-200 text-sm leading-tight break-words" title={log.address}>{log.address}</h3>
<div className="text-xs text-slate-500 font-mono mt-1">{log.lat.toFixed(6)}, {log.lng.toFixed(6)}</div>
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