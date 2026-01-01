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

/**
 * Generate unique anon_number for user anonymization
 * Returns a number between 1-999 that is not already used
 */
async function assignAnonNumber(db) {
  const maxAttempts = 50;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random number 1-999
    const candidate = Math.floor(Math.random() * 999) + 1;
    
    // Check if already used
    const { data: existing } = await db
      .from('users')
      .select('user_id')
      .eq('anon_number', candidate)
      .maybeSingle();
    
    if (!existing) {
      return candidate;
    }
  }
  
  // Fallback: use timestamp-based number
  return Math.floor(Date.now() % 10000);
}

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
      .maybeSingle();

    let userId;
    let hasConsented = false;

    if (existingUser) {
      // Existing user
      userId = existingUser.user_id;
      hasConsented = !!existingUser.consent_at;
      
      // If existing user doesn't have anon_number, assign one
      if (!existingUser.anon_number) {
        const anonNumber = await assignAnonNumber(supabase);
        if (anonNumber) {
          await supabase
            .from('users')
            .update({ anon_number: anonNumber })
            .eq('user_id', userId);
        }
      }
    } else {
      // Generate unique anon_number for new user
      const anonNumber = await assignAnonNumber(supabase);
      
      // New user - create record with anon_number
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            display_name: cleanDisplayName,
            invite_code: cleanInviteCode,
            anon_number: anonNumber,
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

    // Create session
    const sessionData = {
      userId,
      displayName: cleanDisplayName,
      hasConsented,
    };

    const cookieHeaders = createSessionCookie(sessionData);

    // Set cookie and return success
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
