import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin, Trash2, History, Satellite, Usb, Wifi, 
  Map as MapIcon, Terminal, Sun, Moon, Mail, Phone, 
  FileText, Users, MapPinned, ChevronDown, AlertTriangle, 
  Bell, BellOff, Volume2, VolumeX, WifiOff, CloudOff, Download, Upload,
  Layers, DownloadCloud, HardDrive, RefreshCw
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {  
    getFirestore, collection, addDoc, onSnapshot, 
    deleteDoc, doc, query, orderBy, getDocs, writeBatch
} from 'firebase/firestore';


// --- LOGO ASSETS ---
import BlackTex from './assets/BlackTex.png';
import WhiteTex from './assets/WhiteTex.png';


// --- MAP IMPORTS ---
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';


// --- FIX: LEAFLET ICON PATH ISSUE ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyBpqTdsFsuuwYYCE-w0l_op-4tnx-Cy1R0",
  authDomain: "sarge-4586f.firebaseapp.com",
  projectId: "sarge-4586f",
  storageBucket: "sarge-4586f.firebasestorage.app",
  messagingSenderId: "206412196142",
  appId: "1:206412196142:web:02db23e622a3b1376cb2bf",
  measurementId: "G-GS0VHYJBGR"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'my-gps-tracker';


const defaultCenter = [13.7565, 121.0583];


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


// ============ OFFLINE MAP TILE SYSTEM ============


// Cache storage keys
const MAP_CACHE_KEY = 'sarge_map_cache_v2';
const MAP_CACHE_INFO_KEY = 'sarge_map_cache_info';


// Initialize cache
const initializeMapCache = () => {
  if (!localStorage.getItem(MAP_CACHE_KEY)) {
    localStorage.setItem(MAP_CACHE_KEY, JSON.stringify({}));
    localStorage.setItem(MAP_CACHE_INFO_KEY, JSON.stringify({
      lastUpdated: Date.now(),
      totalTiles: 0,
      cacheSize: '0 MB',
      coverage: 'Batangas Region'
    }));
  }
};


// Calculate tile URL for OpenStreetMap
const getTileUrl = (x, y, z) => {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
};


// Calculate tile key for caching
const getTileKey = (x, y, z) => {
  return `tile_${z}_${x}_${y}`;
};


// Check if tile is cached
const isTileCached = (x, y, z) => {
  try {
    const cache = JSON.parse(localStorage.getItem(MAP_CACHE_KEY) || '{}');
    return cache[getTileKey(x, y, z)] !== undefined;
  } catch (error) {
    console.error('Error checking tile cache:', error);
    return false;
  }
};


// Get cached tile URL
const getCachedTileUrl = (x, y, z) => {
  try {
    const cache = JSON.parse(localStorage.getItem(MAP_CACHE_KEY) || '{}');
    const tileData = cache[getTileKey(x, y, z)];
    if (tileData && tileData.data) {
      return `data:image/png;base64,${tileData.data}`;
    }
  } catch (error) {
    console.error('Error getting cached tile:', error);
  }
  return null;
};


// Cache a tile
const cacheTile = async (x, y, z, tileUrl) => {
  try {
    const response = await fetch(tileUrl);
    if (!response.ok) {
      console.error('Failed to fetch tile:', response.status);
      return false;
    }
    
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const base64data = reader.result.split(',')[1];
          
          const cache = JSON.parse(localStorage.getItem(MAP_CACHE_KEY) || '{}');
          cache[getTileKey(x, y, z)] = {
            data: base64data,
            timestamp: Date.now(),
            url: tileUrl
          };
          
          // Update cache info
          const cacheInfo = JSON.parse(localStorage.getItem(MAP_CACHE_INFO_KEY) || '{}');
          cacheInfo.totalTiles = Object.keys(cache).length;
          cacheInfo.lastUpdated = Date.now();
          cacheInfo.cacheSize = `${(JSON.stringify(cache).length / 1024 / 1024).toFixed(2)} MB`;
          
          localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(cache));
          localStorage.setItem(MAP_CACHE_INFO_KEY, JSON.stringify(cacheInfo));
          
          resolve(true);
        } catch (error) {
          console.error('Error processing tile data:', error);
          resolve(false);
        }
      };
      reader.onerror = () => {
        console.error('FileReader error');
        resolve(false);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error caching tile:', error);
    return false;
  }
};


// Pre-cache area around Batangas
const precacheArea = async (centerLat, centerLng, zoomLevels = [10, 11, 12, 13, 14]) => {
  console.log('Starting map precaching for Batangas area...');
  
  const lat = centerLat;
  const lng = centerLng;
  
  for (const z of zoomLevels) {
    // Calculate tile coordinates
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
    
    // Cache 3x3 grid around center
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tileX = x + dx;
        const tileY = y + dy;
        
        if (tileX >= 0 && tileY >= 0) {
          const tileUrl = getTileUrl(tileX, tileY, z);
          
          if (!isTileCached(tileX, tileY, z)) {
            const success = await cacheTile(tileX, tileY, z, tileUrl);
            if (!success) {
              console.warn(`Failed to cache tile ${tileX},${tileY},${z}`);
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // Rate limiting
          }
        }
      }
    }
  }
  
  console.log('Map precaching complete');
  return true;
};


// Clear map cache
const clearMapCache = () => {
  localStorage.removeItem(MAP_CACHE_KEY);
  localStorage.removeItem(MAP_CACHE_INFO_KEY);
  initializeMapCache();
  return true;
};


// Get cache statistics
const getCacheStats = () => {
  try {
    const cache = JSON.parse(localStorage.getItem(MAP_CACHE_KEY) || '{}');
    const cacheInfo = JSON.parse(localStorage.getItem(MAP_CACHE_INFO_KEY) || '{}');
    
    return {
      totalTiles: Object.keys(cache).length,
      cacheSize: `${(JSON.stringify(cache).length / 1024 / 1024).toFixed(2)} MB`,
      lastUpdated: cacheInfo.lastUpdated ? new Date(cacheInfo.lastUpdated).toLocaleString() : 'Never',
      coverage: cacheInfo.coverage || 'Batangas Region'
    };
  } catch (error) {
    return {
      totalTiles: 0,
      cacheSize: '0 MB',
      lastUpdated: 'Never',
      coverage: 'No cache'
    };
  }
};


// Custom TileLayer component that supports offline caching
const CustomTileLayer = () => {
  const map = useMap();
  const [cacheStatus, setCacheStatus] = useState({ cached: 0, total: 0 });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Listen to online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  useEffect(() => {
    if (!map) return;
    
    const updateCacheStatus = () => {
      const zoom = map.getZoom();
      
      // Get visible tile bounds
      const bounds = map.getBounds();
      const tileBounds = map.getPixelBounds();
      const tileSize = 256;
      
      const nw = map.unproject(tileBounds.min, zoom);
      const se = map.unproject(tileBounds.max, zoom);
      
      // Calculate tile coordinates
      const xMin = Math.floor((nw.lng + 180) / 360 * Math.pow(2, zoom));
      const xMax = Math.floor((se.lng + 180) / 360 * Math.pow(2, zoom));
      const yMin = Math.floor((1 - Math.log(Math.tan(nw.lat * Math.PI / 180) + 1 / Math.cos(nw.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      const yMax = Math.floor((1 - Math.log(Math.tan(se.lat * Math.PI / 180) + 1 / Math.cos(se.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      
      let cached = 0;
      let total = 0;
      
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          total++;
          if (isTileCached(x, y, zoom)) {
            cached++;
          }
        }
      }
      
      setCacheStatus({ cached, total });
    };
    
    map.on('moveend', updateCacheStatus);
    map.on('zoomend', updateCacheStatus);
    updateCacheStatus();
    
    return () => {
      map.off('moveend', updateCacheStatus);
      map.off('zoomend', updateCacheStatus);
    };
  }, [map]);
  
  // Custom tile layer implementation for offline mode
  const customTileLayer = L.TileLayer.extend({
    createTile: function(coords, done) {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.style.width = this.options.tileSize + 'px';
      tile.style.height = this.options.tileSize + 'px';
      
      const { x, y, z } = coords;
      const cachedUrl = getCachedTileUrl(x, y, z);
      
      if (cachedUrl) {
        tile.src = cachedUrl;
        tile.onload = () => done(null, tile);
        tile.onerror = () => {
          // If cached tile fails to load, show placeholder
          tile.style.backgroundColor = '#f0f0f0';
          tile.style.display = 'flex';
          tile.style.alignItems = 'center';
          tile.style.justifyContent = 'center';
          tile.innerHTML = '<div style="color: #999; font-size: 10px;">Cached</div>';
          done(null, tile);
        };
      } else {
        // No cached tile available
        tile.style.backgroundColor = '#e0e0e0';
        tile.style.display = 'flex';
        tile.style.alignItems = 'center';
        tile.style.justifyContent = 'center';
        tile.innerHTML = '<div style="color: #999; font-size: 10px;">No Cache</div>';
        done(null, tile);
      }
      
      return tile;
    }
  });
  
  // Render different tile layers based on online status
  return (
    <>
      {/* Online mode - use standard OSM tiles */}
      {isOnline && (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          detectRetina={true}
        />
      )}
      
      {/* Offline mode - use custom tile layer with cache */}
      {!isOnline && (
        <>
          {/* Background for missing tiles */}
          <TileLayer
            url=""
            attribution=""
          />
          
          {/* Custom tile layer for cached tiles */}
          <LayerFactory 
            createLayer={() => new customTileLayer('', {
              tileSize: 256,
              maxZoom: 19,
              minZoom: 1,
              noWrap: true,
              updateWhenIdle: true,
            })}
          />
        </>
      )}
      
      {/* Cache status indicator */}
      {!isOnline && (
        <div className="absolute bottom-2 right-2 z-[1000] bg-black/70 text-white px-3 py-1 rounded text-xs font-bold backdrop-blur-sm">
          📍 Offline: {cacheStatus.cached}/{cacheStatus.total} tiles cached
        </div>
      )}
      
      {/* Warning if no cache available */}
      {!isOnline && cacheStatus.total > 0 && cacheStatus.cached === 0 && (
        <div className="absolute top-2 left-2 z-[1000] bg-red-500/90 text-white px-3 py-1 rounded text-xs font-bold backdrop-blur-sm flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          No cached maps for this area
        </div>
      )}
    </>
  );
};


// Helper component to create custom layer
const LayerFactory = ({ createLayer }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    
    const layer = createLayer();
    layer.addTo(map);
    
    return () => {
      map.removeLayer(layer);
    };
  }, [map, createLayer]);
  
  return null;
};


// Offline tile caching component
const OfflineTileCache = ({ isOnline }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    
    // Initialize cache on component mount
    initializeMapCache();
    
    // Function to cache visible tiles when online
    const cacheVisibleTiles = () => {
      if (!isOnline || !map) return;
      
      const zoom = map.getZoom();
      const bounds = map.getBounds();
      
      // Only cache at certain zoom levels
      if (zoom < 10 || zoom > 16) return;
      
      const tileBounds = map.getPixelBounds();
      const tileSize = 256;
      
      const nw = map.unproject(tileBounds.min, zoom);
      const se = map.unproject(tileBounds.max, zoom);
      
      // Calculate tile coordinates
      const xMin = Math.floor((nw.lng + 180) / 360 * Math.pow(2, zoom));
      const xMax = Math.floor((se.lng + 180) / 360 * Math.pow(2, zoom));
      const yMin = Math.floor((1 - Math.log(Math.tan(nw.lat * Math.PI / 180) + 1 / Math.cos(nw.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      const yMax = Math.floor((1 - Math.log(Math.tan(se.lat * Math.PI / 180) + 1 / Math.cos(se.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      
      // Cache tiles that aren't already cached
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          if (!isTileCached(x, y, zoom)) {
            const tileUrl = getTileUrl(x, y, zoom);
            // Cache in background
            cacheTile(x, y, zoom, tileUrl).catch(console.error);
          }
        }
      }
    };
    
    // Cache tiles when map stops moving
    let cacheTimeout;
    const handleMapMoveEnd = () => {
      clearTimeout(cacheTimeout);
      cacheTimeout = setTimeout(cacheVisibleTiles, 1000);
    };
    
    map.on('moveend', handleMapMoveEnd);
    
    // Initial cache check
    cacheVisibleTiles();
    
    return () => {
      clearTimeout(cacheTimeout);
      map.off('moveend', handleMapMoveEnd);
    };
  }, [map, isOnline]);
  
  return null;
};


function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom(), { animate: true, duration: 1 });
    }
  }, [lat, lng, map]);
  return null;
}


const SargeLogo = ({ theme }) => {
  const isDark = theme === 'dark';
  const logoSrc = isDark ? WhiteTex : BlackTex;
  return (
    <img src={logoSrc} alt="SARGE Logo" className="h-8 sm:h-10 lg:h-12" />
  );
};


const getThemeClasses = (theme) => {
  const isDark = theme === 'dark';
  return {
    bgPrimary: isDark ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDark ? 'bg-gray-800' : 'bg-gray-100',
    textPrimary: isDark ? 'text-gray-100' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-600',
    borderPrimary: isDark ? 'border-gray-700' : 'border-gray-300',
    cardBg: isDark ? 'bg-gray-800' : 'bg-white',
    cardBorder: isDark ? 'border-gray-700' : 'border-gray-200',
    serialBg: isDark ? 'bg-black border-gray-700' : 'bg-gray-50 border-gray-300',
    serialText: isDark ? 'text-gray-400' : 'text-gray-800',
    logoContainer: isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
    footerBg: isDark ? 'bg-gray-800' : 'bg-gray-50'
  };
};


// Create custom pin icons with different colors
const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'custom-pin-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 25px;
        height: 35px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          position: absolute;
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [25, 35],
    iconAnchor: [12, 35],
    popupAnchor: [0, -35]
  });
};


// Create selected pin icon (larger and with pulse animation)
const createSelectedIcon = (color) => {
  return L.divIcon({
    className: 'selected-pin-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 35px;
        height: 45px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 4px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        position: relative;
        animation: pulse 1.5s infinite;
      ">
        <div style="
          position: absolute;
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: rotate(-45deg) scale(1); }
          50% { transform: rotate(-45deg) scale(1.1); }
          100% { transform: rotate(-45deg) scale(1); }
        }
      </style>
    `,
    iconSize: [35, 45],
    iconAnchor: [17, 45],
    popupAnchor: [0, -45]
  });
};


// OFFLINE STORAGE KEYS
const OFFLINE_STORAGE_KEY = 'sarge_offline_logs';
const ADDRESS_CACHE_KEY = 'sarge_address_cache';
const SYNC_QUEUE_KEY = 'sarge_sync_queue';


// Format serial data for display
const formatSerialDisplay = (text) => {
  if (!text) return null;
  
  const lines = text.split('\n').filter(line => line.trim() !== '');
  const formatted = [];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Handle different types of lines
    if (trimmed.startsWith('# ')) {
      // Header
      formatted.push(
        <div key={`line-${index}`} className="text-[#B41B0D] font-bold text-sm">
          {trimmed}
        </div>
      );
    } else if (trimmed.includes('RECEIVED:')) {
      // Parse GPS data line
      const match = trimmed.match(/RECEIVED:\s*'([^']+)'\s*\|\s*RSSI:\s*(-\d+)/);
      if (match) {
        const data = match[1];
        const rssi = match[2];
        
        // Parse individual components
        const latMatch = data.match(/Lat:([-\d.]+)/);
        const lngMatch = data.match(/Lng:([-\d.]+)/);
        const timeMatch = data.match(/Time:([^,]+)/);
        const statusMatch = data.match(/Status:([^,]+)/);
        
        formatted.push(
          <div key={`line-${index}`} className="text-xs">
            <div className="flex items-start gap-1">
              <span className="text-green-500 font-semibold">📍</span>
              <div>
                <div className="font-mono">
                  <span className="text-blue-400">Lat:</span> 
                  <span className="text-yellow-400 ml-1">{latMatch ? parseFloat(latMatch[1]).toFixed(6) : 'N/A'}</span>
                  <span className="text-blue-400 ml-2">Lng:</span> 
                  <span className="text-yellow-400 ml-1">{lngMatch ? parseFloat(lngMatch[1]).toFixed(6) : 'N/A'}</span>
                </div>
                <div className="flex gap-3 mt-1">
                  {timeMatch && (
                    <span className="text-gray-400">Time: {timeMatch[1]}</span>
                  )}
                  {statusMatch && (
                    <span className="text-green-400">Status: {statusMatch[1]}</span>
                  )}
                  <span className="text-purple-400 font-semibold">RSSI: {rssi} dBm</span>
                </div>
              </div>
            </div>
          </div>
        );
      } else {
        formatted.push(
          <div key={`line-${index}`} className="text-gray-400 text-xs">
            {trimmed}
          </div>
        );
      }
    } else if (trimmed.includes('Saved to Database Successfully!') || trimmed.includes('Saved to Firebase!')) {
      formatted.push(
        <div key={`line-${index}`} className="text-green-500 font-semibold text-sm flex items-center gap-1">
          <span>✅</span>
          <span>{trimmed}</span>
        </div>
      );
    } else if (trimmed.includes('Receiver Connected')) {
      formatted.push(
        <div key={`line-${index}`} className="text-green-500 font-semibold text-sm flex items-center gap-1">
          <span>🔗</span>
          <span>{trimmed}</span>
        </div>
      );
    } else if (trimmed.includes('Reading LoRa Data')) {
      formatted.push(
        <div key={`line-${index}`} className="text-blue-400 text-sm flex items-center gap-1">
          <span className="animate-pulse">📡</span>
          <span>{trimmed}...</span>
        </div>
      );
    } else if (trimmed.includes('LIVE SERIAL FEED')) {
      formatted.push(
        <div key={`line-${index}`} className="text-[#B41B0D] font-bold text-sm border-t border-gray-700 pt-2 mt-2">
          {trimmed}
        </div>
      );
    } else if (trimmed.includes('Waiting for packets')) {
      formatted.push(
        <div key={`line-${index}`} className="text-gray-500 text-sm italic">
          ⏳ {trimmed}...
        </div>
      );
    } else {
      formatted.push(
        <div key={`line-${index}`} className="text-gray-400 text-xs">
          {trimmed}
        </div>
      );
    }
    
    // Add spacing between different types of messages
    if (index < lines.length - 1) {
      const nextLine = lines[index + 1].trim();
      if (
        (trimmed.includes('RECEIVED:') && !nextLine.includes('RECEIVED:')) ||
        (trimmed.includes('LIVE SERIAL FEED') && nextLine.includes('RECEIVED:'))
      ) {
        formatted.push(<div key={`spacer-${index}`} className="h-2"></div>);
      }
    }
  });
  
  return formatted;
};


function MainApp() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [port, setPort] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [serialData, setSerialData] = useState(`# Receiver Link
Receiver Connected


Reading LoRa Data...


Saved to Database Successfully!


LIVE SERIAL FEED


> Waiting for packets...`);
  const [status, setStatus] = useState("Ready to Connect");
  const [debugMsg, setDebugMsg] = useState("System Idle");
  const [theme, setTheme] = useState('dark');
  const [locationFilter, setLocationFilter] = useState('All Locations');
  const [selectedLocation, setSelectedLocation] = useState(BATANGAS_LOCATIONS[0]);
  const [selectedLogId, setSelectedLogId] = useState(null);
  
  // NEW: OFFLINE STATE VARIABLES
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [lastSynced, setLastSynced] = useState(null);
  const [offlineQueue, setOfflineQueue] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // NEW: MAP CACHE STATE
  const [mapCacheStats, setMapCacheStats] = useState(getCacheStats());
  const [isCachingMap, setIsCachingMap] = useState(false);
  const [mapCacheProgress, setMapCacheProgress] = useState(0);
  const [showMapCachePanel, setShowMapCachePanel] = useState(false);
  
  // MOBILE DETECTION
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [mapReady, setMapReady] = useState(false);


  // Notification states
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastNotificationId, setLastNotificationId] = useState(null);


  // Ref for auto-scrolling serial feed
  const serialFeedRef = useRef(null);
  // Ref to track marker elements for z-index control
  const markerRefs = useRef({});
  
  // Ref for tracking if we're currently processing data
  const isProcessingRef = useRef(false);
  
  const T = getThemeClasses(theme);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;


  // Team members data - organized alphabetically
  const manuscriptTeam = [
    "Asilo, Sofhia Aubrey M.",
    "De Castro, Aldred Laurenze C.",
    "De Leon, Kate Hannah Bem P.",
    "Punzalan, Athena Ashley R.",
    "Salem, Jillian Ayesa T."
  ].sort();


  const developmentTeam = [
    "Bool, Regina Annemarie I.",
    "De Castro, Aicert Reimiel E.",
    "Fanoga, Haidie N.",
    "Perez, Mhalik B.",
    "Santiago, Francis D.",
    "Talagtag, Karl Andrei C."
  ].sort();


  // ============ DEBUG FUNCTIONS ============
  const debugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, data ? data : '');
    setDebugMsg(message);
  };


  // ============ SIMPLIFIED NETWORK DETECTION ============
  const checkNetworkStatus = async () => {
    try {
      // First check browser online status - this is usually reliable
      if (!navigator.onLine) {
        console.log('Browser reports offline');
        return false;
      }
      
      // Simple fetch check with shorter timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // Shorter timeout
      
      // Use a lightweight endpoint that should work everywhere
      const response = await fetch('https://www.gstatic.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
        mode: 'no-cors' // Don't require CORS
      });
      
      clearTimeout(timeoutId);
      
      // For no-cors mode, response.ok is always false, so we just check if we got a response
      console.log('Network check passed');
      return true;
      
    } catch (error) {
      console.log('Network check failed:', error.message);
      // Even if check fails, we might still be online (especially with no-cors)
      // Let's be optimistic and return true if browser says we're online
      return navigator.onLine;
    }
  };


  // ============ ENHANCED ADDRESS FETCHING ============
  const getAddressWithCache = async (lat, lng) => {
    const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
    const addressCache = JSON.parse(localStorage.getItem(ADDRESS_CACHE_KEY) || '{}');
    
    // Check cache first
    if (addressCache[cacheKey]) {
      return addressCache[cacheKey];
    }
    
    // If online and we have good coordinates, fetch address
    if (isOnline && lat !== 0 && lng !== 0) {
      try {
        // Use a timeout for the address fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
          {
            signal: controller.signal,
            headers: {
              'User-Agent': 'SARGE-GPS-Tracker/1.0'
            }
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`API request failed: ${res.status}`);
        }
        
        const geo = await res.json();
        const address = geo.display_name || `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        // Update cache
        addressCache[cacheKey] = address;
        localStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify(addressCache));
        
        return address;
      } catch (error) {
        console.error('Address fetch error:', error);
        // Return a simple coordinate-based address
        return `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    }
    
    // If offline or coordinates invalid, return approximate location
    return `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };


  // ============ IMPROVED GPS DATA PARSING ============
  const parseGPSData = (rawData) => {
    try {
      // Clean the data
      const cleanData = rawData.trim().replace(/[^\x20-\x7E]/g, '');
      
      console.log("RAW DATA:", rawData);
      console.log("CLEAN DATA:", cleanData);
      
      // Pattern 1: Direct format "Lat:13.756500,Lng:121.058300,Time:12:34:56,Status:CHECK_IN"
      if (cleanData.includes('Lat:') && cleanData.includes('Lng:')) {
        const latMatch = cleanData.match(/Lat:([-\d.]+)/);
        const lngMatch = cleanData.match(/Lng:([-\d.]+)/);
        const statusMatch = cleanData.match(/Status:([^,]+)/);
        const rssiMatch = cleanData.match(/RSSI:([-\d]+)/);
        
        if (latMatch && lngMatch) {
          const lat = parseFloat(latMatch[1]);
          const lng = parseFloat(lngMatch[1]);
          const status = statusMatch ? statusMatch[1].trim() : 'UNKNOWN';
          const rssi = rssiMatch ? parseInt(rssiMatch[1]) : -75;
          
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            return {
              lat,
              lng,
              rssi,
              status,
              timestamp: Date.now(),
              raw: cleanData
            };
          }
        }
      }
      
      // Pattern 2: Received format "RECEIVED: 'Lat:13.756500,Lng:121.058300,Time:12:34:56,Status:CHECK_IN' | RSSI: -65"
      if (cleanData.includes('RECEIVED:')) {
        const receivedMatch = cleanData.match(/RECEIVED:\s*'([^']+)'\s*\|\s*RSSI:\s*(-\d+)/);
        if (receivedMatch) {
          const message = receivedMatch[1];
          const rssi = parseInt(receivedMatch[2]);
          
          const latMatch = message.match(/Lat:([-\d.]+)/);
          const lngMatch = message.match(/Lng:([-\d.]+)/);
          const statusMatch = message.match(/Status:([^,]+)/);
          
          if (latMatch && lngMatch) {
            const lat = parseFloat(latMatch[1]);
            const lng = parseFloat(lngMatch[1]);
            const status = statusMatch ? statusMatch[1].trim() : 'UNKNOWN';
            
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              return {
                lat,
                lng,
                rssi,
                status,
                timestamp: Date.now(),
                raw: cleanData
              };
            }
          }
        }
      }
      
      // Pattern 3: Simple comma-separated format "13.756500,121.058300,CHECK_IN"
      const parts = cleanData.split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        const status = parts[2] || 'UNKNOWN';
        
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          return {
            lat,
            lng,
            rssi: -75,
            status,
            timestamp: Date.now(),
            raw: cleanData
          };
        }
      }
      
      debugLog(`Failed to parse GPS data: ${cleanData}`);
      return null;
    } catch (error) {
      console.error('GPS parsing error:', error);
      debugLog(`GPS parsing error: ${error.message}`);
      return null;
    }
  };


  // ============ IMPROVED SAVE FUNCTION WITH FIXED SERIAL FORMATTING ============
  const saveGPSData = async (rawData) => {
    // Prevent concurrent processing
    if (isProcessingRef.current) {
      console.log('Already processing data, skipping...');
      return;
    }
    
    isProcessingRef.current = true;
    
    try {
      // Parse the GPS data
      const gpsData = parseGPSData(rawData);
      if (!gpsData) {
        debugLog("❌ Failed to parse GPS data");
        return;
      }
      
      // Show data in debug
      debugLog(`📡 GPS: ${gpsData.lat.toFixed(6)}, ${gpsData.lng.toFixed(6)} (${gpsData.status})`);
      
      // Prepare log entry
      const logEntry = {
        lat: gpsData.lat,
        lng: gpsData.lng,
        rssi: gpsData.rssi,
        status: gpsData.status,
        address: "Getting address...", // Placeholder
        timestamp: Date.now(),
        raw: gpsData.raw
      };
      
      // Update serial feed with PROPER FORMATTING
      setSerialData(prev => {
        const timestamp = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
        
        // Create nicely formatted GPS data line
        const formattedLine = `[${timestamp}] RECEIVED: 'Lat:${gpsData.lat.toFixed(6)},Lng:${gpsData.lng.toFixed(6)},Time:${new Date().toLocaleTimeString()},Status:${gpsData.status}' | RSSI: ${gpsData.rssi}`;
        
        // Check if we need to add the initial header
        let baseText = prev;
        if (!baseText.includes('# Receiver Link')) {
          baseText = `# Receiver Link\nReceiver Connected\n\nReading LoRa Data...\n\nSaved to Database Successfully!\n\nLIVE SERIAL FEED\n\n`;
        }
        
        // Add the new data with proper line breaks
        const newText = baseText + '\n' + formattedLine;
        
        // Split into lines and clean up
        const lines = newText.split('\n').filter(line => line.trim() !== '');
        
        // Remove duplicate headers if they exist
        let cleanedLines = [];
        let headerFound = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.includes('# Receiver Link')) {
            if (!headerFound) {
              cleanedLines.push(line);
              headerFound = true;
            }
          } else if (line.includes('LIVE SERIAL FEED')) {
            // Keep only one LIVE SERIAL FEED header
            if (!cleanedLines.some(l => l.includes('LIVE SERIAL FEED'))) {
              cleanedLines.push(line);
            }
          } else {
            cleanedLines.push(line);
          }
        }
        
        // Keep only last 30 lines for performance
        const limitedLines = cleanedLines.slice(-30);
        
        // Reconstruct with proper spacing
        let result = '';
        let lastLineWasData = false;
        
        limitedLines.forEach((line, index) => {
          if (line.startsWith('# ') || line.includes('LIVE SERIAL FEED')) {
            // Headers get their own line
            result += line + '\n';
            lastLineWasData = false;
          } else if (line.includes('RECEIVED:')) {
            // GPS data lines
            if (!lastLineWasData) {
              result += '\n';
            }
            result += line + '\n';
            lastLineWasData = true;
          } else {
            // Other lines
            result += line + '\n';
            lastLineWasData = false;
          }
        });
        
        return result.trim() + (result.trim().endsWith('...') ? '' : '\n');
      });
      
      // Get address and save
      const getAddressAndSave = async () => {
        try {
          const address = await getAddressWithCache(gpsData.lat, gpsData.lng);
          logEntry.address = address;
          
          // Save based on online status
          if (isOnline && user) {
            // Try to save to Firebase
            try {
              const docRef = await addDoc(
                collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), 
                logEntry
              );
              
              debugLog("✅ Saved to Firebase!");
              
              // Update address cache
              if (!address.includes('(Offline)')) {
                const cacheKey = `${gpsData.lat.toFixed(4)}_${gpsData.lng.toFixed(4)}`;
                const addressCache = JSON.parse(localStorage.getItem(ADDRESS_CACHE_KEY) || '{}');
                addressCache[cacheKey] = address;
                localStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify(addressCache));
              }
              
              return { success: true, firebaseId: docRef.id };
            } catch (firebaseError) {
              console.error('Firebase save error:', firebaseError);
              // Firebase failed, save locally
              const offlineId = saveToLocalStorage(logEntry);
              debugLog("⚠️ Internet issue - saved locally");
              return { success: false, offline: true, id: offlineId };
            }
          } else {
            // Offline or no user - save locally
            const offlineId = saveToLocalStorage(logEntry);
            debugLog("📱 Saved OFFLINE - Will sync when online");
            return { success: false, offline: true, id: offlineId };
          }
        } catch (addressError) {
          console.error('Address processing error:', addressError);
          // Save with basic address
          logEntry.address = `Near ${gpsData.lat.toFixed(4)}, ${gpsData.lng.toFixed(4)}`;
          
          if (isOnline && user) {
            try {
              await addDoc(
                collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), 
                logEntry
              );
              debugLog("✅ Saved to Firebase (basic address)");
            } catch (error) {
              saveToLocalStorage(logEntry);
              debugLog("⚠️ Saved locally (address error)");
            }
          } else {
            saveToLocalStorage(logEntry);
            debugLog("📱 Saved OFFLINE (address error)");
          }
        }
      };
      
      // Start address fetching and saving process
      getAddressAndSave();
      
    } catch (error) {
      console.error('Save GPS data error:', error);
      debugLog(`❌ Save error: ${error.message}`);
    } finally {
      isProcessingRef.current = false;
    }
  };


  // ============ OFFLINE FUNCTIONS ============
  const saveToLocalStorage = (data) => {
    try {
      const offlineLogs = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
      const syncQueue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
      
      const logEntry = {
        ...data,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        offlineSaved: true,
        localTimestamp: Date.now(),
        synced: false
      };
      
      offlineLogs.unshift(logEntry); // Add to beginning
      syncQueue.unshift(logEntry);
      
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineLogs));
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(syncQueue));
      
      // Update offline queue count
      const queueCount = syncQueue.length;
      setOfflineQueue(queueCount);
      
      // Update logs state to show offline data immediately
      setLogs(prev => [logEntry, ...prev]);
      
      return logEntry.id;
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      return null;
    }
  };


  // Sync offline data when coming online
  const syncOfflineData = async () => {
    if (!user || !isOnline || isSyncing) return;
    
    setIsSyncing(true);
    const syncQueue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    
    if (syncQueue.length === 0) {
      setIsSyncing(false);
      return;
    }
    
    debugLog(`🔄 Syncing ${syncQueue.length} offline records...`);
    
    let successfulSyncs = 0;
    let failedSyncs = 0;
    const failedItems = [];
    
    // Process sync queue
    for (let i = 0; i < syncQueue.length; i++) {
      const log = syncQueue[i];
      
      try {
        // Skip if already synced
        if (log.synced) {
          successfulSyncs++;
          continue;
        }
        
        // Get fresh address if needed
        let address = log.address;
        if (address.includes('Getting address') || address.includes('Near')) {
          address = await getAddressWithCache(log.lat, log.lng);
        }
        
        // Save to Firebase
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), {
          lat: log.lat,
          lng: log.lng,
          rssi: log.rssi,
          status: log.status,
          address: address,
          timestamp: log.timestamp || Date.now(),
          syncedFromOffline: true,
          originalOfflineId: log.id
        });
        
        // Mark as synced
        syncQueue[i].synced = true;
        successfulSyncs++;
        
        // Update progress
        if (i % 2 === 0) {
          debugLog(`🔄 Syncing... ${successfulSyncs}/${syncQueue.length}`);
        }
        
      } catch (error) {
        console.error('Failed to sync log:', error, log);
        failedSyncs++;
        failedItems.push(log);
      }
      
      // Small delay to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update sync queue (remove successfully synced items)
    const remainingQueue = failedItems;
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));
    
    // Update offline logs (mark synced items)
    const offlineLogs = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
    const updatedOfflineLogs = offlineLogs.map(log => {
      const syncedLog = syncQueue.find(s => s.id === log.id);
      return syncedLog ? { ...log, synced: syncedLog.synced } : log;
    });
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(updatedOfflineLogs));
    
    // Update state
    setOfflineQueue(remainingQueue.length);
    setLastSynced(new Date().toLocaleTimeString());
    
    if (successfulSyncs > 0) {
      debugLog(`✅ Synced ${successfulSyncs} records${failedSyncs > 0 ? `, ${failedSyncs} failed` : ''}`);
    } else if (failedSyncs > 0) {
      debugLog(`❌ Failed to sync ${failedSyncs} records`);
    }
    
    setIsSyncing(false);
  };


  // Load offline logs into state
  const loadOfflineLogs = () => {
    try {
      const offlineLogs = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
      const syncQueue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
      
      setOfflineQueue(syncQueue.length);
      
      // Merge with Firebase logs (offline logs will be displayed first)
      if (offlineLogs.length > 0) {
        console.log(`Loaded ${offlineLogs.length} offline logs, ${syncQueue.length} in sync queue`);
      }
      
    } catch (error) {
      console.error('Error loading offline logs:', error);
    }
  };


  // ============ MAP CACHE FUNCTIONS ============
  const handlePrecacheMap = async () => {
    if (!isOnline) {
      debugLog("Need internet connection to cache maps");
      return;
    }
    
    setIsCachingMap(true);
    setMapCacheProgress(0);
    debugLog("🔄 Downloading map tiles for offline use...");
    
    try {
      await precacheArea(defaultCenter[0], defaultCenter[1]);
      setMapCacheStats(getCacheStats());
      debugLog("✅ Map caching complete!");
    } catch (error) {
      console.error('Map caching error:', error);
      debugLog("❌ Map caching failed");
    } finally {
      setIsCachingMap(false);
    }
  };


  const handleClearMapCache = () => {
    if (window.confirm("Clear all cached map tiles? This will remove offline map capability.")) {
      clearMapCache();
      setMapCacheStats(getCacheStats());
      debugLog("🗑️ Map cache cleared");
    }
  };


  // ============ SIMPLIFIED NETWORK & AUTH INITIALIZATION ============
  useEffect(() => {
    // Initialize offline systems
    initializeMapCache();
    loadOfflineLogs();
    
    // Set initial network status based on browser
    const initialOnlineStatus = navigator.onLine;
    setIsOnline(initialOnlineStatus);
    setOfflineMode(!initialOnlineStatus);
    
    if (initialOnlineStatus) {
      debugLog("✅ Online - Ready to receive data");
    } else {
      debugLog("⚠️ Offline - Starting in offline mode");
    }
    
    // Set up simple network event listeners
    const handleOnline = async () => {
      console.log('Browser online event triggered');
      setIsOnline(true);
      setOfflineMode(false);
      debugLog("📶 Back Online - Ready to sync");
      
      // Try to sync offline data after a short delay
      setTimeout(() => {
        if (user && offlineQueue > 0) {
          debugLog("🔄 Starting auto-sync...");
          syncOfflineData();
        }
      }, 3000);
    };
    
    const handleOffline = () => {
      console.log('Browser offline event triggered');
      setIsOnline(false);
      setOfflineMode(true);
      debugLog("⚠️ OFFLINE MODE - Data will be saved locally");
      
      if (soundEnabled) {
        playOfflineSound();
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodically check network status (optional, but helpful)
    const networkCheckInterval = setInterval(() => {
      const currentStatus = navigator.onLine;
      if (currentStatus !== isOnline) {
        if (currentStatus) {
          handleOnline();
        } else {
          handleOffline();
        }
      }
    }, 10000); // Check every 10 seconds
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(networkCheckInterval);
    };
  }, [user, soundEnabled, offlineQueue]);


  // === FIX 2: ADD THIS NEW useEffect FOR MOBILE ===
  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                    window.innerWidth < 768;
      setIsMobileDevice(mobile);
      if (mobile) {
        setStatus("Mobile View - Ready");
        setDebugMsg("📱 Mobile Device - Viewing Live GPS Data");
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Force map to load on mobile
    setTimeout(() => {
      setMapReady(true);
    }, 500);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        debugLog("✅ Authentication successful");
      } catch (e) {
        debugLog(`❌ Auth Error: ${e.message}`);
      }
    };
    
    initAuth();
    
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        debugLog(`👤 User: ${u.uid.substring(0, 8)}...`);
      }
    });
  }, []);


  // Firebase listener for logs
  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs'), 
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseLogs = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        source: 'firebase'
      }));
      
      // Load offline logs
      const offlineLogs = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]')
        .filter(log => !log.synced)
        .map(log => ({ ...log, source: 'offline' }));
      
      // Merge logs, with offline logs first
      const allLogs = [...offlineLogs, ...firebaseLogs];
      
      // Notification logic for new Firebase logs
      if (firebaseLogs.length > 0 && notificationsEnabled) {
        const latestLog = firebaseLogs[0];
        const isRecent = Date.now() - latestLog.timestamp < 10000;
        
        if (isRecent && latestLog.id !== lastNotificationId) {
          playNotificationSound();
          
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("📍 New GPS Location", {
              body: `Lat: ${latestLog.lat.toFixed(4)}, Lng: ${latestLog.lng.toFixed(4)}`,
              icon: '/favicon.ico'
            });
          }
          
          setLastNotificationId(latestLog.id);
        }
      }
      
      setLogs(allLogs);
    }, (error) => {
      console.error('Firebase listener error:', error);
      debugLog(`❌ Database Error: ${error.message}`);
    });
    
    return () => unsubscribe();
  }, [user, lastNotificationId, notificationsEnabled]);


  // Auto-scroll serial feed
  useEffect(() => {
    if (serialFeedRef.current) {
      serialFeedRef.current.scrollTop = serialFeedRef.current.scrollHeight;
    }
  }, [serialData]);


  // ============ SERIAL CONNECTION FUNCTIONS ============
  const connectSerial = async () => {
    if (isMobile || !navigator.serial) {
      debugLog("❌ Web Serial requires desktop Chrome/Edge");
      setStatus("Use Desktop Browser");
      return;
    }


    try {
      setStatus("Selecting port...");
      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsReading(true);
      setStatus("Receiver Connected");
      debugLog("✅ Serial connected - Waiting for GPS data...");
      
      // Set initial serial data display
      setSerialData(`# Receiver Link
Receiver Connected


Reading LoRa Data...


Saved to Database Successfully!


LIVE SERIAL FEED


`);
      
      // Start reading
      const reader = selectedPort.readable.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      const processStream = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              reader.releaseLock();
              break;
            }
            
            // Decode the incoming data
            const text = decoder.decode(value);
            buffer += text;
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine) {
                await saveGPSData(trimmedLine);
              }
            }
          }
        } catch (error) {
          console.error('Read error:', error);
          debugLog(`❌ Read error: ${error.message}`);
        } finally {
          reader.releaseLock();
        }
      };
      
      processStream();
      
    } catch (error) {
      setStatus("Connection Failed");
      debugLog(`❌ Connection error: ${error.message}`);
    }
  };


  const disconnectSerial = async () => {
    if (port) {
      try {
        await port.close();
        setPort(null);
        setIsReading(false);
        setStatus("Ready to Connect");
        debugLog("Serial disconnected");
        setSerialData(`# Receiver Link
Receiver Connected


Reading LoRa Data...


Saved to Database Successfully!


LIVE SERIAL FEED


> Waiting for packets...`);
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  };


  // ============ LOG MANAGEMENT FUNCTIONS ============
  const handleLogSelect = (logId) => {
    if (logId === selectedLogId) {
      setSelectedLogId(null);
    } else {
      setSelectedLogId(logId);
      if (soundEnabled) {
        playSelectionSound();
      }
    }
  };


  const handleDelete = async (id) => {
    try {
      // Check if it's an offline log
      if (id.startsWith('offline_')) {
        // Remove from offline storage
        const offlineLogs = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
        const syncQueue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
        
        const updatedOfflineLogs = offlineLogs.filter(log => log.id !== id);
        const updatedSyncQueue = syncQueue.filter(log => log.id !== id);
        
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(updatedOfflineLogs));
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedSyncQueue));
        
        setOfflineQueue(updatedSyncQueue.length);
        setLogs(prev => prev.filter(log => log.id !== id));
        debugLog("🗑️ Offline log deleted");
      } else {
        // Delete from Firebase
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'gps_logs', id));
        debugLog("🗑️ Firebase log deleted");
      }
      
      // Clear selection if deleted log was selected
      if (id === selectedLogId) {
        setSelectedLogId(null);
      }
    } catch (e) {
      debugLog(`❌ Delete Error: ${e.message}`);
    }
  };


  const bulkDeleteLogs = async () => {
    if (!user) {
      debugLog("Delete Failed: No User Logged In");
      return;
    }
   
    if (!window.confirm(`Are you sure you want to delete ALL logs (${logs.length} records)? This includes offline data and cannot be undone.`)) {
      return;
    }
   
    debugLog(`Starting bulk delete of ${logs.length} records...`);


    try {
      // Delete Firebase logs
      const batch = writeBatch(db);
      const logCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'gps_logs');
      const snapshot = await getDocs(logCollectionRef);


      snapshot.forEach(document => {
        batch.delete(document.ref);
      });


      await batch.commit();
      
      // Clear offline storage
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
      localStorage.removeItem(SYNC_QUEUE_KEY);
      setOfflineQueue(0);
      
      debugLog("✅ All GPS logs cleared");
      setSelectedLogId(null);
    } catch (e) {
      console.error("Bulk Delete Error:", e);
      debugLog(`❌ Bulk Delete FAILED: ${e.message}`);
    }
  };


  // ============ HELPER FUNCTIONS ============
  const playSelectionSound = () => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      // Sound not supported
    }
  };


  const playOfflineSound = () => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 400;
      oscillator.type = 'sawtooth';
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      // Sound not supported
    }
  };


  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      // Sound not supported
    }
  };


  const handleManualSync = () => {
    if (isOnline && user && offlineQueue > 0) {
      syncOfflineData();
    }
  };


  const clearOfflineData = () => {
    if (window.confirm(`Clear ${offlineQueue} unsynced offline logs? This cannot be undone.`)) {
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
      localStorage.removeItem(SYNC_QUEUE_KEY);
      setOfflineQueue(0);
      setLogs(prev => prev.filter(log => !log.offlineSaved || log.synced));
      debugLog(`🗑️ Cleared ${offlineQueue} offline logs`);
    }
  };


  const handleLocationChange = (location) => {
    setLocationFilter(location.name);
    setSelectedLocation(location);
    setSelectedLogId(null);
  };


  // Filter logs based on location
  const filteredLogs = useMemo(() => {
    if (locationFilter === 'All Locations') return logs;
    const filterTerm = locationFilter.replace(' City', '').toLowerCase();
    return logs.filter(log => 
      log.address && log.address.toLowerCase().includes(filterTerm)
    );
  }, [logs, locationFilter]);


  // Get current center for map
  const currentCenter = selectedLocation.name === 'All Locations' && filteredLogs.length > 0
    ? [filteredLogs[0].lat, filteredLogs[0].lng]
    : selectedLocation.coords;


  // Get selected log
  const selectedLog = useMemo(() => {
    return filteredLogs.find(log => log.id === selectedLogId);
  }, [filteredLogs, selectedLogId]);


  // Cleanup serial connection on unmount
  useEffect(() => {
    return () => {
      if (port) {
        disconnectSerial();
      }
    };
  }, [port]);


  // Get marker color based on selection and signal strength
  const getMarkerColor = (log) => {
    if (log.id === selectedLogId) {
      return '#FF0000';
    } else if (log.rssi > -70) {
      return '#00FF00';
    } else if (log.rssi > -85) {
      return '#FFFF00';
    } else {
      return '#FFA500';
    }
  };


  // Get marker icon
  const getMarkerIcon = (log) => {
    const color = getMarkerColor(log);
    return log.id === selectedLogId ? createSelectedIcon(color) : createCustomIcon(color);
  };


  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);


  // Update map cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setMapCacheStats(getCacheStats());
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);


  return (
    <div className={`min-h-screen ${T.bgPrimary} font-sans ${T.textPrimary} transition-colors duration-300 flex flex-col`}>
      <div className="p-3 md:p-8 flex-grow">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
         
          {/* LOGO HEADER */}
          <div className={`lg:col-span-3 mb-3 md:mb-4 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-lg border ${T.logoContainer} flex justify-between items-center transition-all duration-300`}>
            <SargeLogo theme={theme} />
            
            {/* MAP CACHE BUTTON */}
            <button
              onClick={() => setShowMapCachePanel(!showMapCachePanel)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors ${
                mapCacheStats.totalTiles > 0
                  ? 'bg-green-500/20 text-green-500 border border-green-500/30 hover:bg-green-500/30'
                  : 'bg-gray-500/20 text-gray-500 border border-gray-500/30 hover:bg-gray-500/30'
              }`}
              title="Map Cache Status"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">
                {mapCacheStats.totalTiles} tiles
              </span>
            </button>
            
            {/* Control Buttons */}
            <div className="flex gap-2">
              {/* Sync Button */}
              {offlineQueue > 0 && isOnline && (
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className={`p-2 md:p-3 rounded-full transition-colors duration-300 shadow-md min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    isSyncing 
                      ? 'bg-blue-600 text-white border-2 border-blue-700' 
                      : 'bg-green-600 text-white border-2 border-green-700 hover:bg-green-500'
                  }`}
                  title={isSyncing ? "Syncing..." : `Sync ${offlineQueue} offline records`}
                >
                  {isSyncing ? (
                    <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </button>
              )}


              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 md:p-3 rounded-full transition-colors duration-300 shadow-md min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  soundEnabled 
                    ? 'bg-[#B41B0D] text-white border-2 border-[#8A1509] hover:bg-[#A3180B]' 
                    : 'bg-gray-600 text-white border-2 border-gray-700 hover:bg-gray-500'
                }`}
                title={soundEnabled ? "Mute sound" : "Enable sound"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 md:w-5 md:h-5" /> : <VolumeX className="w-4 h-4 md:w-5 md:h-5" />}
              </button>


              {/* Notifications Toggle */}
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`p-2 md:p-3 rounded-full transition-colors duration-300 shadow-md min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  notificationsEnabled 
                    ? 'bg-[#B41B0D] text-white border-2 border-[#8A1509] hover:bg-[#A3180B]' 
                    : 'bg-gray-600 text-white border-2 border-gray-700 hover:bg-gray-500'
                }`}
                title={notificationsEnabled ? "Disable notifications" : "Enable notifications"}
              >
                {notificationsEnabled ? <Bell className="w-4 h-4 md:w-5 md:h-5" /> : <BellOff className="w-4 h-4 md:w-5 md:h-5" />}
              </button>


              {/* Theme Toggle */}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className={`p-2 md:p-3 rounded-full transition-colors duration-300 shadow-md min-h-[44px] min-w-[44px] flex items-center justify-center bg-[#B41B0D] text-white border-2 border-[#8A1509] hover:bg-[#A3180B]`}
                title="Toggle Theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
            </div>
          </div>
         
          {/* Left Panel - Receiver Link */}
          <div className="space-y-4 md:space-y-6">
            <div className={`${T.cardBg} p-4 md:p-6 rounded-xl md:rounded-2xl shadow-lg border ${T.cardBorder} transition-all duration-300`}>
             
              <div className="flex items-center gap-3 mb-3 md:mb-4">
                <div className="p-2 bg-[#B41B0D] rounded-lg">
                  <Usb className="text-white w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h1 className={`text-lg md:text-xl font-bold ${T.textPrimary}`}>Receiver Link</h1>
                  <p className={`text-xs ${T.textSecondary}`}>{status}</p>
                </div>
                {/* Network Status Indicator */}
              </div>
             
              {!isReading ? (
                <button 
                  onClick={connectSerial}
                  className="w-full py-3 md:py-4 bg-[#B41B0D] hover:bg-[#A3180B] text-white rounded-lg md:rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-[#B41B0D]/20 min-h-[44px] text-sm md:text-base border-2 border-[#8A1509]"
                  disabled={isMobile}
                >
                  <Usb className="w-4 h-4 md:w-5 md:h-5" /> 
                  {isMobile ? "Use Desktop" : "Connect to Receiver"}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-[#B41B0D] border border-[#8A1509] rounded-lg flex items-center gap-2 text-white text-sm">
                    <Wifi className="w-4 h-4 md:w-5 md:h-5 animate-pulse" /> 
                    <span className="font-medium">Reading LoRa Data...</span>
                  </div>
                  <button 
                    onClick={disconnectSerial}
                    className="w-full py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition min-h-[44px] text-sm border-2 border-gray-700"
                  >
                    <Usb className="w-4 h-4" /> 
                    Disconnect
                  </button>
                </div>
              )}
             
              {/* DEBUG STATUS BOX */}
              <div className={`mt-3 md:mt-4 p-2 md:p-3 rounded-lg border flex items-start gap-2 text-xs ${
                debugMsg.includes('❌') || debugMsg.includes('Error') || debugMsg.includes('Failed') 
                  ? 'bg-red-900/30 border-red-700 text-red-300' 
                  : debugMsg.includes('OFFLINE') || debugMsg.includes('offline')
                  ? 'bg-amber-900/30 border-amber-700 text-amber-300'
                  : `${T.bgSecondary} ${T.borderPrimary} ${T.textSecondary}`
              }`}>
                <Terminal className={`w-3 h-3 md:w-4 md:h-4 mt-0.5 flex-shrink-0 ${
                  debugMsg.includes('❌') ? 'text-red-500' : 
                  debugMsg.includes('OFFLINE') ? 'text-amber-500' : 
                  'text-gray-500'
                }`} />
                <span className={`font-mono break-all ${T.textSecondary}`}>{debugMsg}</span>
              </div>


              {/* Offline Data Status */}
              {offlineQueue > 0 && (
                <div className={`mt-3 md:mt-4 p-3 rounded-lg border ${
                  isOnline 
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      <span className="text-sm font-semibold">
                        {offlineQueue} offline record{offlineQueue !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {isOnline ? (
                        <button
                          onClick={handleManualSync}
                          disabled={isSyncing}
                          className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition"
                        >
                          {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                      ) : (
                        <span className="px-2 py-1 bg-amber-500 text-white text-xs rounded">
                          Wait for internet
                        </span>
                      )}
                      <button
                        onClick={clearOfflineData}
                        className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded transition"
                        title="Clear offline data"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {lastSynced && isOnline && (
                    <p className="text-xs mt-1 opacity-80">Last synced: {lastSynced}</p>
                  )}
                </div>
              )}


              <div className="mt-3 md:mt-4">
                <label className={`text-xs font-bold ${T.textSecondary} uppercase tracking-wider`}>Live Serial Feed</label>
                <div 
                  ref={serialFeedRef}
                  className={`mt-2 p-2 md:p-3 ${T.serialBg} font-mono text-xs rounded-lg h-24 md:h-32 overflow-auto relative break-all shadow-inner ${T.serialText}`}
                >
                  {formatSerialDisplay(serialData)}
                  
                  {/* Show empty state */}
                  {!serialData || serialData.trim() === '' ? (
                    <div className="text-center py-4 text-gray-500 italic">
                      No data received yet...
                    </div>
                  ) : null}
                  
                  {/* Auto-scroll indicator */}
                  <div className="text-right">
                    <div className="inline-block px-2 py-1 bg-gray-800/50 text-gray-400 text-[10px] rounded mt-2">
                      Auto-scroll ✓
                    </div>
                  </div>
                </div>
                
                {/* Feed stats */}
                <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                  <span>
                    Lines: {serialData.split('\n').filter(l => l.trim() !== '').length}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Live
                  </span>
                </div>
              </div>
            </div>


            {/* MAP CACHE PANEL */}
            {showMapCachePanel && (
              <div className={`${T.cardBg} p-4 md:p-6 rounded-xl md:rounded-2xl shadow-lg border ${T.cardBorder} transition-all duration-300`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-lg font-bold ${T.textPrimary} flex items-center gap-2`}>
                    <Layers className="w-5 h-5 text-[#B41B0D]" />
                    Offline Map Cache
                  </h3>
                  <button
                    onClick={() => setShowMapCachePanel(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>


                {/* Cache Stats */}
                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${T.textSecondary}`}>Cached Tiles:</span>
                    <span className={`font-bold ${mapCacheStats.totalTiles > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {mapCacheStats.totalTiles}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${T.textSecondary}`}>Cache Size:</span>
                    <span className={`font-bold ${T.textPrimary}`}>{mapCacheStats.cacheSize}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${T.textSecondary}`}>Last Updated:</span>
                    <span className={`text-sm ${T.textSecondary}`}>{mapCacheStats.lastUpdated}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${T.textSecondary}`}>Coverage:</span>
                    <span className={`text-sm ${T.textSecondary}`}>{mapCacheStats.coverage}</span>
                  </div>
                </div>


                {/* Progress Bar */}
                {isCachingMap && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-1">
                      <span className={`text-sm ${T.textSecondary}`}>Caching maps...</span>
                      <span className={`text-sm font-bold ${T.textPrimary}`}>{mapCacheProgress}%</span>
                    </div>
                    <div className="map-cache-progress">
                      <div 
                        className="map-cache-progress-fill" 
                        style={{ width: `${mapCacheProgress}%` }}
                      />
                    </div>
                  </div>
                )}


                {/* Action Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={handlePrecacheMap}
                    disabled={isCachingMap || !isOnline}
                    className={`w-full py-2 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 min-h-[44px] ${
                      isCachingMap
                        ? 'bg-blue-600 text-white'
                        : isOnline
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    {isCachingMap ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Caching...
                      </>
                    ) : (
                      <>
                        <DownloadCloud className="w-4 h-4" />
                        {isOnline ? 'Cache Batangas Maps' : 'Need Internet'}
                      </>
                    )}
                  </button>


                  <button
                    onClick={handleClearMapCache}
                    disabled={isCachingMap || mapCacheStats.totalTiles === 0}
                    className={`w-full py-2 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 min-h-[44px] ${
                      mapCacheStats.totalTiles > 0 && !isCachingMap
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear Map Cache
                  </button>
                </div>


                {/* Tips */}
                <div className={`mt-4 p-3 rounded-lg border ${T.cardBorder} ${T.bgSecondary}`}>
                  <p className={`text-xs ${T.textSecondary} leading-relaxed`}>
                    <strong>💡 Tip:</strong> Cache maps while online to view them offline later. 
                    Batangas area maps require ~5-10MB storage.
                  </p>
                </div>
              </div>
            )}
          </div>


          {/* Right Panel: Map & Logs */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
           
            {/* LOCATION FILTER PANEL */}
            <div className={`${T.cardBg} p-3 md:p-4 rounded-xl md:rounded-2xl shadow-lg border ${T.cardBorder} transition-all duration-300`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 md:gap-3">
                  <MapPinned className="w-4 h-4 md:w-5 md:h-5 text-[#B41B0D]" />
                  <span className={`text-sm font-bold ${T.textPrimary}`}>Viewing Area:</span>
                </div>
               
                <div className="relative">
                  <select
                    value={locationFilter}
                    onChange={(e) => handleLocationChange(BATANGAS_LOCATIONS.find(loc => loc.name === e.target.value))}
                    className={`py-2 px-3 text-sm rounded-lg shadow-sm font-semibold focus:ring-2 focus:ring-[#B41B0D] transition-colors cursor-pointer min-h-[44px] ${T.bgSecondary} ${T.textPrimary} ${T.cardBorder} border appearance-none pr-8`}
                  >
                    {BATANGAS_LOCATIONS.map(loc => (
                      <option key={loc.name} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none text-[#B41B0D]" />
                </div>
              </div>
            </div>


            {/* MAP */}
            <div className={`${T.cardBg} rounded-xl md:rounded-2xl shadow-lg border ${T.cardBorder} overflow-hidden h-[250px] md:h-[400px] relative z-0 transition-all duration-300 touch-pan-y`}>
              <div className={`absolute top-2 md:top-4 right-2 md:right-4 z-[400] ${T.bgSecondary}/90 backdrop-blur-sm p-1 md:p-2 rounded text-xs font-bold ${T.textPrimary} shadow-lg flex items-center gap-1 md:gap-2`}>
                <MapIcon className="w-3 h-3 md:w-4 md:h-4 text-[#B41B0D]" />
                {locationFilter}
                {!isOnline && mapCacheStats.totalTiles > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded ml-1">
                    OFFLINE
                  </span>
                )}
              </div>
             
              {/* === FIX 3: UPDATE MAPCONTAINER FOR MOBILE === */}
              {mapReady && (
                <MapContainer
                  center={selectedLog ? [selectedLog.lat, selectedLog.lng] : currentCenter}
                  zoom={isMobileDevice ? 11 : 13}
                  style={{ 
                    height: "100%", 
                    width: "100%",
                    touchAction: "none"  // Fix for mobile
                  }}
                  dragging={true}
                  touchZoom={true}
                  scrollWheelZoom={false}
                  zoomControl={true}
                  tap={false}  // Important for mobile
                  key={`map-${mapReady}-${isMobileDevice}`}
                >
                  <OfflineTileCache isOnline={isOnline} />
                  <CustomTileLayer />
                 
                  <RecenterMap 
                    lat={selectedLog ? selectedLog.lat : currentCenter[0]} 
                    lng={selectedLog ? selectedLog.lng : currentCenter[1]} 
                  />


                  {filteredLogs.map((log) => (
                    (log.lat !== 0 && log.lng !== 0 && !isNaN(log.lat)) && (
                      <Marker 
                        key={log.id} 
                        position={[log.lat, log.lng]}
                        icon={getMarkerIcon(log)}
                        ref={(ref) => {
                          if (ref) {
                            markerRefs.current[log.id] = ref;
                          }
                        }}
                        eventHandlers={{
                          click: () => {
                            handleLogSelect(log.id);
                          }
                        }}
                      >
                        <Popup className="text-xs">
                          <div className="text-slate-800 font-bold">
                            {log.address} 
                            {log.offlineSaved && !log.synced && (
                              <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-white text-xs rounded">OFFLINE</span>
                            )}
                            <br/>
                            <span className="text-slate-500 font-mono">{log.lat.toFixed(6)}, {log.lng.toFixed(6)}</span>
                            <br/>
                            <span className={`text-sm ${log.id === selectedLogId ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                              RSSI: {log.rssi} dBm {log.id === selectedLogId ? ' (SELECTED)' : ''}
                            </span>
                            {log.status && <span className="text-xs text-blue-600 block">Status: {log.status}</span>}
                          </div>
                        </Popup>
                      </Marker>
                    )
                  ))}
                </MapContainer>
              )}
              
              {/* Show loading on mobile */}
              {!mapReady && isMobileDevice && (
                <div className="h-full flex items-center justify-center bg-gray-800/50">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#B41B0D] mx-auto mb-2" />
                    <p className="text-white text-sm">Loading map for mobile...</p>
                  </div>
                </div>
              )}
            </div>


            {/* LOGS SECTION */}
            <div className={`${T.cardBg} rounded-xl md:rounded-2xl shadow-lg border ${T.cardBorder} h-[300px] md:h-[400px] flex flex-col transition-all duration-300`}>
              <div className={`p-4 md:p-6 border-b ${T.cardBorder} flex justify-between items-center`}>
                <div className="flex items-center gap-2">
                  <h2 className={`text-base md:text-lg font-bold ${T.textPrimary} flex items-center gap-2`}>
                    <History className="w-4 h-4 md:w-5 md:h-5 text-[#B41B0D]" /> Live Feed
                  </h2>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold border ${T.cardBorder} bg-[#B41B0D]/10 text-[#B41B0D]`}>
                    {filteredLogs.length} Records
                  </span>
                  {offlineQueue > 0 && (
                    <span className="px-2 py-1 rounded-full text-xs font-bold border border-amber-500 bg-amber-500/20 text-amber-500">
                      {offlineQueue} Offline
                    </span>
                  )}
                </div>


                {filteredLogs.length > 0 && (
                  <button
                    onClick={bulkDeleteLogs}
                    className="px-3 py-2 bg-[#B41B0D] hover:bg-[#A3180B] text-white border-2 border-[#8A1509] rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 min-h-[44px]"
                    title="Delete ALL logs"
                    disabled={!user}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="hidden sm:inline">Clear All</span>
                  </button>
                )}
              </div>
             
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 md:space-y-3">
                {filteredLogs.length === 0 ? (
                  <div className={`h-full flex flex-col items-center justify-center ${T.textSecondary} opacity-50 p-4 text-center`}>
                    <Satellite className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 text-[#B41B0D]" />
                    <p className="text-sm">
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
                      onClick={() => handleLogSelect(log.id)}
                      className={`relative flex gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl border cursor-pointer transition-all duration-300 group ${
                        log.id === selectedLogId 
                          ? 'border-[#FF0000] bg-[#FF0000]/10 border-2'
                          : `${T.bgSecondary}/50 ${T.cardBorder} hover:border-[#B41B0D]/50`
                      }`}
                    >
                      <div className={`p-2 md:p-3 rounded-lg ${
                        log.id === selectedLogId 
                          ? 'bg-[#FF0000]'
                          : log.offlineSaved && !log.synced
                          ? 'bg-gradient-to-br from-amber-500 to-amber-700'
                          : 'bg-gradient-to-br from-[#B41B0D] to-[#8A1509]'
                      } text-white border-0 shadow-lg flex-shrink-0`}>
                        <MapPin className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${
                              log.id === selectedLogId ? 'text-white' : T.textSecondary
                            } uppercase`}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            {log.offlineSaved && !log.synced && (
                              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] rounded border border-amber-500/30">
                                OFFLINE
                              </span>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 ${
                            log.id === selectedLogId ? 'bg-white/20 border-white' : `${T.bgSecondary} ${T.cardBorder}`
                          } rounded text-[10px] font-mono ${
                            log.id === selectedLogId ? 'text-white font-bold' : T.textSecondary
                          } shrink-0`}>
                            RSSI: {log.rssi} dBm {log.id === selectedLogId && '⭐'}
                          </span>
                        </div>
                        <h3 className={`font-bold ${
                          log.id === selectedLogId ? 'text-white' : T.textPrimary
                        } text-sm leading-tight break-words`} title={log.address}>
                          {log.address}
                        </h3>
                        <div className={`text-xs ${
                          log.id === selectedLogId ? 'text-white/80 font-semibold' : T.textSecondary
                        } font-mono mt-1`}>
                          {log.lat.toFixed(6)}, {log.lng.toFixed(6)}
                        </div>
                        {log.status && (
                          <div className={`text-xs ${
                            log.id === selectedLogId ? 'text-white font-bold' : 'text-blue-600'
                          } font-semibold mt-1`}>
                            Status: {log.status} {log.id === selectedLogId && '📍'}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(log.id);
                        }}
                        className={`transition-all duration-300 self-center opacity-70 group-hover:opacity-100 shrink-0 hover:scale-110 min-w-[44px] min-h-[44px] flex items-center justify-center ${
                          log.id === selectedLogId ? 'text-white hover:text-gray-300' : 'text-[#B41B0D] hover:text-[#A3180B]'
                        }`}
                      >
                        <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* FOOTER */}
      <footer className={`mt-8 py-6 md:py-8 border-t ${T.borderPrimary} transition-colors duration-300 ${T.bgPrimary}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10">
           
            {/* Research Paper & Contact Information */}
      <div className="space-y-6 text-center lg:text-left">
        {/* Research Paper Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 justify-center lg:justify-start">
            <div className="p-2 bg-[#B41B0D] rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h3 className={`text-lg font-bold ${T.textPrimary}`}>Research Paper</h3>
          </div>
          <p className={`text-sm ${T.textSecondary} leading-relaxed`}>
            Explore our full research, <strong>SARGE: Search and Rescue GPS-LoRa Emergency System</strong>, on integrating LoRa technology with GPS-based location tracking.
          </p>
          <div className="flex justify-center lg:justify-start">
            {/* Replace the button with a link */}
            <a 
              href="https://drive.google.com/file/d/1fWsPhTlmSr3S9KrI_yVRs8qP4_JSaNEY/view" 
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-[#B41B0D] hover:bg-[#A3180B] text-white rounded-lg font-semibold text-sm transition-all duration-300 shadow-lg hover:shadow-[#B41B0D]/50 flex items-center gap-2 min-h-[44px] border-2 border-[#8A1509]"
            >
              <FileText className="w-4 h-4" />
              Download PDF File
            </a>
          </div>
        </div>


              {/* Contact Information */}
              <div className={`pt-6 border-t ${T.borderPrimary}`}>
                <div className="flex items-center gap-3 mb-4 justify-center lg:justify-start">
                  <div className="p-2 bg-[#B41B0D] rounded-lg">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <h3 className={`text-lg font-bold ${T.textPrimary}`}>Contact Information</h3>
                </div>
                
                <div className="space-y-3">
                  <p className={`text-sm ${T.textSecondary} flex items-center gap-2 justify-center lg:justify-start`}>
                    <Mail className="w-4 h-4 text-[#B41B0D]" />
                    Sarge@gmail.com
                  </p>
                  <p className={`text-sm ${T.textSecondary} flex items-center gap-2 justify-center lg:justify-start`}>
                    <Phone className="w-4 h-4 text-[#B41B0D]" />
                    0915-244-9768
                  </p>
                  <div className={`text-sm ${T.textSecondary} space-y-1`}>
                    <p>BS Computer Science - 2103</p>
                    <p>College of Informatics and Computing Sciences</p>
                    <p>Batangas State University, The National Engineering University - Alangilan</p>
                  </div>
                </div>
              </div>
            </div>


            {/* Team Sections */}
            <div className="lg:col-span-2 space-y-8">
             
              {/* Manuscript and Documentation */}
              <div className="space-y-4 text-center lg:text-left">
                <div className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="p-2 bg-[#B41B0D] rounded-lg">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <h3 className={`text-lg font-bold ${T.textPrimary}`}>Manuscript and Documentation</h3>
                </div>
               
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  {manuscriptTeam.map((member, index) => (
                    <p key={index} className={`font-semibold ${T.textPrimary}`}>{member}</p>
                  ))}
                </div>
              </div>


              {/* Software & Hardware Development */}
              <div className="space-y-4 text-center lg:text-left">
                <div className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="p-2 bg-[#B41B0D] rounded-lg">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <h3 className={`text-lg font-bold ${T.textPrimary}`}>Software & Hardware Development</h3>
                </div>
               
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  {developmentTeam.map((member, index) => (
                    <p key={index} className={`font-semibold ${T.textPrimary}`}>{member}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={`mt-6 pt-4 md:pt-6 border-t ${T.borderPrimary} text-center ${T.textSecondary} w-full`}>
            <p className="text-sm font-semibold">
                © 2025 SARGE: Search and Rescue GPS-LoRa Emergency System. All rights reserved.
            </p>
        </div>
      </footer>
    </div>
  );
}


// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }


  static getDerivedStateFromError(error) {
    return { hasError: true };
  }


  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }


  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md text-center">
            <AlertTriangle className="w-12 h-12 text-[#B41B0D] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600">Please refresh the page and try again.</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-[#B41B0D] hover:bg-[#A3180B] text-white rounded-lg transition-colors min-h-[44px] border-2 border-[#8A1509]"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
