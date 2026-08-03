import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issues in Leaflet with Webpack/Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom red icon for emergency SOS markers
const RedSOSIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to dynamically adjust map view center if center prop changes
const MapController = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

const MapComponent = ({ 
  center = [7.8731, 80.7718], // Centered on Sri Lanka
  zoom = 8,
  hazards = [],
  sosAlerts = [],
  onMapClick
}) => {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        className="leaflet-container"
      >
        <MapController center={center} zoom={zoom} />
        
        {/* OpenStreetMap TileLayer (100% free, no API key required) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Hazard Markers */}
        {hazards.map((hazard) => (
          <Marker 
            key={hazard.id || `h-${hazard.latitude}-${hazard.longitude}`}
            position={[parseFloat(hazard.latitude), parseFloat(hazard.longitude)]}
          >
            <Popup>
              <div style={{ color: '#0f172a', padding: '0.2rem' }}>
                <h4 style={{ margin: '0 0 0.25rem 0', color: '#e63946', fontSize: '1.05rem' }}>
                  {hazard.type}
                </h4>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
                  <strong>Severity:</strong> {hazard.severity}
                </p>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  {hazard.description || 'No description provided.'}
                </p>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '0.5rem' }}>
                  Logged: {new Date(hazard.created_at || Date.now()).toLocaleTimeString()}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Active Emergency SOS Markers */}
        {sosAlerts.map((sos) => (
          <Marker 
            key={sos.id || `sos-${sos.latitude}-${sos.longitude}`}
            position={[parseFloat(sos.latitude), parseFloat(sos.longitude)]}
            icon={RedSOSIcon}
          >
            <Popup>
              <div style={{ color: '#991b1b', padding: '0.2rem' }}>
                <h4 style={{ margin: '0 0 0.25rem 0', color: '#dc2626', fontWeight: 800 }}>
                  🚨 EMERGENCY SOS DISTRESS SIGNAL
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  Status: <strong>{sos.status}</strong>
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#7f1d1d' }}>
                  Lat: {sos.latitude}, Lng: {sos.longitude}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
