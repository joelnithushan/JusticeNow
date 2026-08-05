const supabase = require('../config/supabase');

// Allowed values - must match the CHECK constraints in schema.sql
const HAZARD_TYPES = ['dengue', 'flood', 'heat', 'landslide'];
const SEVERITY_LEVELS = ['low', 'medium', 'high'];

// Mock in-memory data store fallback when Supabase keys are placeholders
let mockHazards = [
  {
    id: 'h1',
    type: 'Flood',
    latitude: 6.9271,
    longitude: 79.8612,
    severity: 'High',
    description: 'Kelani river level rising near Kelanimulla area. Water entering low-lying houses.',
    reporter_id: 'u1',
    created_at: new Date().toISOString()
  },
  {
    id: 'h2',
    type: 'Landslide',
    latitude: 6.6828,
    longitude: 80.3992,
    severity: 'Critical',
    description: 'Earth slip along Ratnapura-Balangoda road. Debris blocking both lanes.',
    reporter_id: 'u2',
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'h3',
    type: 'Dengue Outbreak',
    latitude: 7.2906,
    longitude: 80.6337,
    severity: 'Medium',
    description: 'High mosquito density reported near Kandy bus stand area after heavy rains.',
    reporter_id: 'u3',
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

/**
 * Get all hazard reports
 */
const getAllHazards = async (req, res) => {
  try {
    // If Supabase credentials are not configured, return mock data for testing UI
    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
      return res.status(200).json({
        success: true,
        source: 'mock_data',
        count: mockHazards.length,
        data: mockHazards
      });
    }

    const { data, error } = await supabase
      .from('hazard_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error fetching hazard reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve hazard reports',
      error: error.message
    });
  }
};

/**
 * Create a new hazard report
 */
const createHazard = async (req, res) => {
  try {
    const { type, latitude, longitude, severity, description, reporter_id } = req.body;

    if (!type || latitude === undefined || longitude === undefined || !severity) {
      return res.status(400).json({
        success: false,
        message: 'Type, latitude, longitude, and severity are required fields.'
      });
    }

    // Schema requires a known reporter (hazard_reports.reporter_id NOT NULL)
    if (!reporter_id) {
      return res.status(400).json({
        success: false,
        message: 'reporter_id is required - reports must belong to a registered user.'
      });
    }

    // Normalize to lowercase so values pass the DB CHECK constraints
    const normalizedType = String(type).toLowerCase();
    const normalizedSeverity = String(severity).toLowerCase();
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!HAZARD_TYPES.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid hazard type '${type}'. Allowed: ${HAZARD_TYPES.join(', ')}.`
      });
    }

    if (!SEVERITY_LEVELS.includes(normalizedSeverity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid severity '${severity}'. Allowed: ${SEVERITY_LEVELS.join(', ')}.`
      });
    }

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Latitude must be between -90 and 90, longitude between -180 and 180.'
      });
    }

    const newHazard = {
      type: normalizedType,
      latitude: lat,
      longitude: lng,
      severity: normalizedSeverity,
      description: description || '',
      reporter_id,
      created_at: new Date().toISOString()
    };

    // If Supabase credentials are placeholders, save to mock store
    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
      const created = { id: `h_${Date.now()}`, ...newHazard };
      mockHazards.unshift(created);
      return res.status(201).json({
        success: true,
        source: 'mock_data',
        message: 'Hazard report logged successfully (mock mode).',
        data: created
      });
    }

    const { data, error } = await supabase
      .from('hazard_reports')
      .insert([newHazard])
      .select();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Hazard report submitted successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error creating hazard report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to log hazard report',
      error: error.message
    });
  }
};

module.exports = {
  getAllHazards,
  createHazard
};
