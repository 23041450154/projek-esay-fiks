/**
 * /api/companion/close
 * POST - Close a group room (companion only)
 * Sets room status to 'closed' and inserts system message
 */

const { v4: uuidv4 } = require('uuid');
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

    // Fetch session details
    const { data: session, error: sessError } = await supabase
      .from('chat_sessions')
      .select('session_id, companion_id, room_type, status')
      .eq('session_id', sessionId)
      .single();

    if (sessError) {
      // Handle case where room_type/status columns don't exist yet
      if (sessError.code === '42703') {
        return res.status(400).json({ 
          error: 'Database migration required. Please run supabase-room-close-migration.sql' 
        });
      }
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify companion is assigned to this session
    if (session.companion_id !== companion.companionId) {
      return res.status(403).json({ error: 'Not assigned to this session' });
    }

    // Check if already closed
    if (session.status === 'closed') {
      return res.status(200).json({
        success: true,
        message: 'Session already closed',
      });
    }

    // ONLY allow closing GROUP rooms
    // Private chat between user and companion should not be deletable by companion
    if (session.room_type !== 'group') {
      return res.status(403).json({ 
        error: 'Hanya ruang grup yang dapat ditutup. Chat pribadi tidak dapat dihapus.' 
      });
    }

    // Update session status to closed
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: companion.companionId,
      })
      .eq('session_id', sessionId);

    if (updateError) {
      console.error('Close session error:', updateError);
      return res.status(500).json({ error: 'Failed to close session' });
    }

    // Insert system message to notify users
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        message_id: uuidv4(),
        session_id: sessionId,
        sender_id: null,
        display_name: 'Sistem',
        text: 'Ruang grup ini telah ditutup oleh pendamping.',
        is_companion: false,
        is_system: true,
      });

    if (msgError) {
      // Log but don't fail - the room is already closed
      console.warn('Failed to insert system message:', msgError);
    }

    return res.status(200).json({
      success: true,
      message: 'Session closed successfully',
    });

  } catch (err) {
    console.error('Companion close error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
