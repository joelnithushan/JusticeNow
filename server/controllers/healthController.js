const supabase = require('../config/supabase');

/**
 * Health Check Controller
 * Verifies backend API server operational status and tests the Supabase
 * connection with a lightweight head-only count query on the users table.
 */
const getHealthStatus = async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact' })
      .limit(1);

    if (error) throw error;

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      userCount: count,
      message: 'Community Hazard Alert & Response System API is running smoothly.',
      timestamp: new Date().toISOString(),
      group: 'SPM_NU_WE_01',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health Check Error:', error);
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'API server is running but the database connection failed. ' +
        'Check SUPABASE_URL / SUPABASE_KEY in server/.env and confirm the schema has been run.',
      error: error.message
    });
  }
};

module.exports = {
  getHealthStatus
};
