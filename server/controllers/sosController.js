const supabase = require('../config/supabase');

let mockSOSList = [
  {
    id: 'sos_1',
    user_id: 'u1',
    latitude: 6.6850,
    longitude: 80.4010,
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  }
];

/**
 * Get active SOS distress alerts
 */
const getActiveSOS = async (req, res) => {
  try {
    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
      return res.status(200).json({
        success: true,
        source: 'mock_data',
        data: mockSOSList
      });
    }

    const { data, error } = await supabase
      .from('sos')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching active SOS alerts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS alerts',
      error: error.message
    });
  }
};

/**
 * Create a new emergency SOS alert
 */
const createSOS = async (req, res) => {
  try {
    const { user_id, latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Current location coordinates (latitude and longitude) are required for an SOS call.'
      });
    }

    const newSOS = {
      user_id: user_id || null,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
      const created = { id: `sos_${Date.now()}`, ...newSOS };
      mockSOSList.unshift(created);
      return res.status(201).json({
        success: true,
        source: 'mock_data',
        message: '🚨 Emergency SOS Broadcast Sent! Emergency response teams notified.',
        data: created
      });
    }

    const { data, error } = await supabase
      .from('sos')
      .insert([newSOS])
      .select();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: '🚨 Emergency SOS alert broadcasted successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error triggering SOS:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to dispatch SOS alert',
      error: error.message
    });
  }
};

module.exports = {
  getActiveSOS,
  createSOS
};
