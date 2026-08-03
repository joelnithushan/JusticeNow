import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitHazard } from '../services/api';
import { AlertOctagon, MapPin, Send, Crosshair } from 'lucide-react';

const HAZARD_TYPES = [
  'Flood',
  'Landslide',
  'Dengue Outbreak',
  'Heavy Rain / Storm',
  'Tsunami Warning',
  'Coastal Erosion',
  'Wild Animal Intrusion'
];

const SEVERITY_LEVELS = [
  { value: 'Low', label: 'Low - Advisory / Watch' },
  { value: 'Medium', label: 'Medium - Moderate Concern' },
  { value: 'High', label: 'High - Threat to Property' },
  { value: 'Critical', label: 'Critical - Imminent Danger / Evacuate' }
];

const ReportHazard = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    type: 'Flood',
    latitude: '6.9271',
    longitude: '79.8612',
    severity: 'High',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData({
          ...formData,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6)
        });
      },
      (err) => {
        alert('Could not access current location. Using current values.');
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await submitHazard(formData);
      if (response.data && response.data.success) {
        setMessage({ type: 'success', text: response.data.message || 'Hazard report logged successfully!' });
        setTimeout(() => navigate('/feed'), 1500);
      }
    } catch (error) {
      console.error('Submit Hazard Error:', error);
      const errText = error.response?.data?.message || 'Failed to submit hazard report.';
      setMessage({ type: 'error', text: errText });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '650px', margin: '2rem auto' }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <AlertOctagon color="var(--color-primary)" size={32} />
          <div>
            <h2 style={{ fontSize: '1.75rem' }}>Report Community Hazard</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Notify Sri Lankan emergency services and citizens in your region
            </p>
          </div>
        </div>

        {message && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
          }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Hazard Type */}
          <div className="form-group">
            <label className="form-label">Hazard Category</label>
            <select
              name="type"
              className="form-select"
              value={formData.type}
              onChange={handleChange}
              required
            >
              {HAZARD_TYPES.map((t) => (
                <option key={t} value={t} style={{ background: '#0f172a' }}>{t}</option>
              ))}
            </select>
          </div>

          {/* Location Coordinates */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Incident Coordinates (Sri Lanka)</label>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleDetectLocation}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
              >
                <Crosshair size={14} /> Detect GPS Location
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <input
                type="number"
                step="any"
                name="latitude"
                className="form-input"
                placeholder="Latitude (e.g. 6.9271)"
                value={formData.latitude}
                onChange={handleChange}
                required
              />
              <input
                type="number"
                step="any"
                name="longitude"
                className="form-input"
                placeholder="Longitude (e.g. 79.8612)"
                value={formData.longitude}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {/* Severity */}
          <div className="form-group">
            <label className="form-label">Severity Level</label>
            <select
              name="severity"
              className="form-select"
              value={formData.severity}
              onChange={handleChange}
              required
            >
              {SEVERITY_LEVELS.map((s) => (
                <option key={s.value} value={s.value} style={{ background: '#0f172a' }}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Hazard Description & Impact</label>
            <textarea
              name="description"
              rows={4}
              className="form-textarea"
              placeholder="Describe the condition, affected road names, or immediate risks (e.g., Kelani river overflowed across main road)..."
              value={formData.description}
              onChange={handleChange}
            ></textarea>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={loading}
          >
            <Send size={18} />
            {loading ? 'Submitting Hazard Report...' : 'Publish Hazard Report'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReportHazard;
