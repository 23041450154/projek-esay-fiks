/**
 * POST /api/auth/login
 * Login with invite code and display name (Supabase version)
 */

const { supabase } = require('../_lib/supabase');
const { 
  createSessionCookie, 
  isValidInviteCode, 
  sanitizeInput 
} = require('../_lib/auth');
const { strictRateLimit } = require('../_lib/rateLimit');
const { ensureAnonNumber } = require('../_lib/anonNumber');

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply strict rate limiting for login
  if (strictRateLimit(req, res)) return;

  try {
    const { inviteCode, displayName } = req.body || {};

    // Validate inputs
    const cleanInviteCode = sanitizeInput(inviteCode, 50);
    const cleanDisplayName = sanitizeInput(displayName, 50);

    if (!cleanInviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    if (!cleanDisplayName || cleanDisplayName.length < 2) {
      return res.status(400).json({ 
        error: 'Display name is required (minimum 2 characters)' 
      });
    }

    // Validate invite code
    if (!isValidInviteCode(cleanInviteCode)) {
      return res.status(401).json({ error: 'Invalid invite code' });
    }

    // Check if user already exists
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('display_name', cleanDisplayName)
      .eq('invite_code', cleanInviteCode)
      .single();

    let userId;
    let hasConsented = false;

    if (existingUser) {
      // Existing user - return their data
      userId = existingUser.user_id;
      hasConsented = !!existingUser.consent_at;
    } else {
      // New user - create record
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            display_name: cleanDisplayName,
            invite_code: cleanInviteCode,
          }
        ])
        .select()
        .single();

      if (insertError) {
        console.error('Login - Insert error:', insertError);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      userId = newUser.user_id;
      hasConsented = false;
    }

    // Ensure user has anonymous number assigned (for companion dashboard)
    await ensureAnonNumber(userId);

    // Create session
    const sessionData = {
      userId,
      displayName: cleanDisplayName,
      hasConsented,
    };

    const cookieHeaders = createSessionCookie(sessionData);

    res.setHeader('Set-Cookie', cookieHeaders['Set-Cookie']);

    return res.status(200).json({
      success: true,
      user: {
        userId,
        displayName: cleanDisplayName,
        hasConsented,
      },
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
