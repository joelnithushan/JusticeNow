const supabase = require('../config/supabase');
const { CASE_TYPES, DISTRICTS } = require('../constants');

/**
 * GET /api/organisations
 * Public endpoint to list active legal aid organisations.
 * Query params: ?district=...&case_type=...&search=...
 */
const listOrganisations = async (req, res) => {
  try {
    const { district, case_type, search } = req.query;

    let query = supabase
      .from('organisations')
      .select('id, name, description, district, case_types, contact_phone, contact_email, is_active, created_at')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (district) {
      if (!DISTRICTS.includes(district)) {
        return res.status(400).json({ success: false, message: 'Invalid district.' });
      }
      query = query.eq('district', district);
    }

    if (case_type) {
      if (!CASE_TYPES.includes(case_type)) {
        return res.status(400).json({ success: false, message: 'Invalid case_type.' });
      }
      query = query.contains('case_types', [case_type]);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch organisations:', error.message);
      return res.status(500).json({ success: false, message: 'Could not load organisations. Please try again.' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error fetching organisations:', err);
    return res.status(500).json({ success: false, message: 'Could not load organisations. Please try again.' });
  }
};

module.exports = {
  listOrganisations,
};
