/**
 * /api/companion/read
 * POST - Mark a session as read by companion
 * Updates companion_last_read_at timestamp
 */

const jwt = require('jsonwebtoken');
const { getSupabase } = require('../_lib/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'safespace-secret-key-2025';

function getCompanionFromRequest(req) {
  const cookies = req.headers.cookie || '';
  const tokenMatch = cookies.match(/companion_token=([^;]+)/);
  if (!tokenMatch) return null;

  try {
    const decoded = jwt.verify(tokenMatch[1], JWT_SECRET);
    if (!decoded.isCompanion) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check companion authentication
  const companion = getCompanionFromRequest(req);
  if (!companion) {
    return res.status(401).json({ error: 'Not authenticated as companion' });
  }

  const supabase = getSupabase();

  try {
    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Verify companion is assigned to this session
    const { data: session, error: sessError } = await supabase
      .from('chat_sessions')
      .select('session_id, companion_id')
      .eq('session_id', sessionId)
      .single();

    if (sessError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.companion_id !== companion.companionId) {
      return res.status(403).json({ error: 'Not assigned to this session' });
    }

    // Update companion_last_read_at to current timestamp
    // Note: Column may not exist if migration hasn't been run yet
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ companion_last_read_at: new Date().toISOString() })
      .eq('session_id', sessionId);

    if (updateError) {
      // Silently ignore if column doesn't exist (migration not run yet)
      if (updateError.code === '42703') {
        console.warn('Mark read: companion_last_read_at column not found. Run migration.');
        return res.status(200).json({
          success: true,
          message: 'Session marked as read (migration pending)',
        });
      }
      console.error('Mark read error:', updateError);
      return res.status(500).json({ error: 'Failed to mark as read' });
    }

    return res.status(200).json({
      success: true,
      message: 'Session marked as read',
    });

  } catch (err) {
    console.error('Companion read error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
