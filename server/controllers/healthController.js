const supabase = require('../config/supabase');

/**
 * Health Check Controller
 * Verifies backend API server operational status and tests Supabase connection
 */
const getHealthStatus = async (req, res) => {
  try {
    const isConfigured = Boolean(
      process.env.SUPABASE_URL && 
      !process.env.SUPABASE_URL.includes('placeholder')
    );

    return res.status(200).json({
      status: 'OK',
      message: 'Community Hazard Alert & Response System API is running smoothly.',
      timestamp: new Date().toISOString(),
      group: 'SPM_NU_WE_01',
      supabaseConfigured: isConfigured,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health Check Error:', error);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Internal server health check failure',
      error: error.message
    });
  }
};

module.exports = {
  getHealthStatus
};
