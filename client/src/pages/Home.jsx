import React, { useState, useEffect } from 'react';
import MapComponent from '../components/MapComponent';
import { fetchHazards, fetchActiveSOS, triggerSOSCall } from '../services/api';
import { AlertTriangle, Radio, ShieldAlert, CheckCircle, Info } from 'lucide-react';

const Home = () => {
  const [hazards, setHazards] = useState([]);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sosStatus, setSosStatus] = useState(null);

  useEffect(() => {
    loadMapData();
  }, []);

  const loadMapData = async () => {
    try {
      setLoading(true);
      const [hazardsRes, sosRes] = await Promise.all([
        fetchHazards().catch(() => ({ data: { data: [] } })),
        fetchActiveSOS().catch(() => ({ data: { data: [] } }))
      ]);

      if (hazardsRes.data && hazardsRes.data.data) {
        setHazards(hazardsRes.data.data);
      }
      if (sosRes.data && sosRes.data.data) {
        setSosAlerts(sosRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load map data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSOS = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setSosStatus('Locating your position...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          setSosStatus('Broadcasting SOS to response teams...');
          const response = await triggerSOSCall({
            latitude: lat,
            longitude: lng,
            user_id: null
          });

          if (response.data && response.data.success) {
            setSosStatus('🚨 SOS ALERT SENT SUCCESSFULLY!');
            loadMapData(); // Refresh map with new SOS marker
          }
        } catch (error) {
          console.error('SOS call failed:', error);
          setSosStatus('Failed to send SOS. Please try again or contact local emergency numbers.');
        }
      },
      (error) => {
        // Fallback: If user denies GPS, mock SOS location near Colombo for testing
        const fallbackLat = 6.9271;
        const fallbackLng = 79.8612;
        triggerSOSCall({ latitude: fallbackLat, longitude: fallbackLng, user_id: null })
          .then(() => {
            setSosStatus('🚨 SOS Alert Dispatched (Using approximate Colombo coordinates)');
            loadMapData();
          })
          .catch(() => setSosStatus('Unable to access location for SOS'));
      }
    );
  };

  return (
    <div>
      {/* Hero / Emergency Dispatch Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
          Sri Lanka Community Hazard Map
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.1rem', maxWidth: '700px', margin: '0 auto 1.5rem auto' }}>
          Real-time spatial monitoring of floods, landslides, dengue clusters, and emergency citizen SOS alerts.
        </p>

        {/* Instant SOS Distress Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-sos" onClick={handleSOS}>
            <Radio size={24} />
            SEND IMMEDIATE SOS LOCATION ALERT
          </button>
          {sosStatus && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.15)', 
              color: '#fca5a5', 
              padding: '0.5rem 1.25rem', 
              borderRadius: '999px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              fontSize: '0.9rem',
              fontWeight: 600
            }}>
              {sosStatus}
            </div>
          )}
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Active Hazard Reports</p>
              <h2 style={{ fontSize: '2rem', marginTop: '0.2rem' }}>{hazards.length}</h2>
            </div>
            <AlertTriangle color="var(--color-primary)" size={36} />
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Active SOS Distress Calls</p>
              <h2 style={{ fontSize: '2rem', marginTop: '0.2rem' }}>{sosAlerts.length}</h2>
            </div>
            <ShieldAlert color="#ef4444" size={36} />
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--color-accent-teal)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>System Status</p>
              <h2 style={{ fontSize: '1.25rem', color: '#6ee7b7', marginTop: '0.4rem' }}>
                Operational (Sri Lanka)
              </h2>
            </div>
            <CheckCircle color="#6ee7b7" size={36} />
          </div>
        </div>
      </div>

      {/* Interactive Map Section */}
      <div className="card" style={{ padding: '1rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
          <h3 style={{ fontSize: '1.25rem' }}>📍 Interactive Island Map</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Map Tiles: OpenStreetMap (Sri Lanka Center: 7.8731° N, 80.7718° E)
          </span>
        </div>
        {loading ? (
          <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>Loading map coordinates and active hazards...</p>
          </div>
        ) : (
          <MapComponent hazards={hazards} sosAlerts={sosAlerts} />
        )}
      </div>

      {/* Info Banner */}
      <div className="card" style={{ background: 'rgba(69, 123, 157, 0.15)', borderColor: 'rgba(69, 123, 157, 0.3)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <Info color="var(--color-accent-sky)" size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ color: 'var(--color-accent-sky)', marginBottom: '0.25rem' }}>About this system</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Developed by University Group <strong>SPM_NU_WE_01</strong>. Citizens can log environmental hazards and request emergency response. In case of life-threatening emergencies, also contact Sri Lanka Disaster Management Centre (DMC) at 117.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
