import React, { useState, useEffect } from 'react';
import { fetchHazards } from '../services/api';
import { Rss, Filter, MapPin, Calendar, AlertTriangle } from 'lucide-react';

const ReportsFeed = () => {
  const [hazards, setHazards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const res = await fetchHazards();
      if (res.data && res.data.data) {
        setHazards(res.data.data);
      }
    } catch (error) {
      console.error('Failed to load reports feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredHazards = filterSeverity === 'ALL'
    ? hazards
    : hazards.filter(h => h.severity.toUpperCase() === filterSeverity.toUpperCase());

  const getSeverityBadgeClass = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'badge-critical';
      case 'high': return 'badge-high';
      case 'medium': return 'badge-medium';
      default: return 'badge-low';
    }
  };

  return (
    <div>
      {/* Header & Filter Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Rss color="var(--color-primary)" /> Community Hazard Feed
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
            Live stream of crowd-sourced hazard alerts reported across Sri Lankan districts
          </p>
        </div>

        {/* Severity Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={18} color="var(--color-text-muted)" />
          <select 
            className="form-select"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            style={{ width: 'auto', padding: '0.5rem 1rem' }}
          >
            <option value="ALL" style={{ background: '#0f172a' }}>All Severities</option>
            <option value="CRITICAL" style={{ background: '#0f172a' }}>Critical Danger</option>
            <option value="HIGH" style={{ background: '#0f172a' }}>High Threat</option>
            <option value="MEDIUM" style={{ background: '#0f172a' }}>Medium Concern</option>
            <option value="LOW" style={{ background: '#0f172a' }}>Low Advisory</option>
          </select>
        </div>
      </div>

      {/* Reports Feed List */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>Fetching latest community reports...</p>
        </div>
      ) : filteredHazards.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <AlertTriangle color="var(--color-text-muted)" size={40} style={{ marginBottom: '1rem' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>No hazard reports found matching the selected filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredHazards.map((item) => (
            <div key={item.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.35rem', color: '#ffffff' }}>{item.type}</h3>
                  <span className={`badge ${getSeverityBadgeClass(item.severity)}`}>
                    {item.severity}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Calendar size={14} />
                  {new Date(item.created_at || Date.now()).toLocaleString()}
                </div>
              </div>

              <p style={{ color: 'var(--color-text-main)', fontSize: '0.95rem', marginBottom: '1rem' }}>
                {item.description || 'No detailed description provided for this incident.'}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem', color: 'var(--color-accent-sky)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={15} /> Coordinates: {item.latitude}, {item.longitude}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportsFeed;
