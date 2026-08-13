/**
 * JusticeNow — Health check controller.
 * Confirms the API is up AND that it can actually reach the database.
 */

const supabase = require('../config/supabase');

// GET /api/health
// Runs a lightweight query (count of case_reports, no rows fetched)
// so "ok" really means the database connection works.
const checkHealth = async (req, res) => {
  try {
    const { error } = await supabase
      .from('case_reports')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return res.status(503).json({
        success: false,
        status: 'error',
        database: 'disconnected',
        message: `Database check failed: ${error.message}`,
      });
    }

    return res.json({ success: true, status: 'ok', database: 'connected' });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: 'error',
      database: 'disconnected',
      message: `Database check failed: ${err.message}`,
    });
  }
};

module.exports = { checkHealth };
