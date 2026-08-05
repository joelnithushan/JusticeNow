const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');

/**
 * Register a new user profile
 */
const registerUser = async (req, res) => {
  try {
    const { name, email, password, district, ds_division } = req.body;

    if (!name || !email || !password || !district || !ds_division) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, district, and DS division are required.'
      });
    }

    const newUser = {
      name,
      email,
      password_hash: await bcrypt.hash(password, 10),
      district,
      ds_division
    };

    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
      return res.status(201).json({
        success: true,
        source: 'mock_data',
        message: 'User registered successfully (mock mode).',
        user: { id: `u_${Date.now()}`, name, email, district, ds_division }
      });
    }

    const { data, error } = await supabase
      .from('users')
      .insert([newUser])
      .select('id, name, email, district, ds_division, created_at');

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully!',
      user: data[0]
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

/**
 * Login user
 */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
      return res.status(200).json({
        success: true,
        source: 'mock_data',
        message: 'Logged in successfully (mock mode).',
        token: 'mock-jwt-token-12345',
        user: {
          id: 'u_101',
          name: 'Joel Nithushan',
          email,
          district: 'Colombo',
          ds_division: 'Thimbirigasyaya'
        }
      });
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, district, ds_division, password_hash')
      .eq('email', email)
      .single();

    const passwordMatches = data
      ? await bcrypt.compare(password, data.password_hash)
      : false;

    if (error || !passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Omit password hash from output
    const { password_hash: _, ...userProfile } = data;

    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
      token: `auth-token-${userProfile.id}`,
      user: userProfile
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

module.exports = {
  registerUser,
  loginUser
};
