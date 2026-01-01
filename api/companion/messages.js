/**
 * /api/companion/messages
 * GET - Get messages for a session (companion must be assigned)
 * POST - Send message as companion
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check companion authentication
  const companion = getCompanionFromRequest(req);
  if (!companion) {
    return res.status(401).json({ error: 'Not authenticated as companion' });
  }

  const supabase = getSupabase();

  try {
    // GET - Get messages for a session
    if (req.method === 'GET') {
      const { sessionId } = req.query || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      // Verify companion is assigned to this session
      const { data: session, error: sessError } = await supabase
        .from('chat_sessions')
        .select('session_id, companion_id, topic')
        .eq('session_id', sessionId)
        .single();

      if (sessError || !session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.companion_id !== companion.companionId) {
        return res.status(403).json({ error: 'Not assigned to this session' });
      }

      // Get session user's anon_number for anonymization
      const { data: sessionUser } = await supabase
        .from('chat_sessions')
        .select(`
          users!inner (
            user_id,
            anon_number
          )
        `)
        .eq('session_id', sessionId)
        .single();

      const userAnonNumber = sessionUser?.users?.anon_number || null;

      // Get messages
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('message_id, sender_id, display_name, text, created_at, is_companion, is_system')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      // Format anon label helper
      const formatAnonLabel = (n) => n ? 'Pengguna ' + String(n).padStart(3, '0') : 'Pengguna ---';

      return res.status(200).json({
        success: true,
        session: {
          sessionId: session.session_id,
          topic: session.topic,
          anonNumber: userAnonNumber,
        },
        messages: messages.map((m) => ({
          messageId: m.message_id,
          senderId: m.sender_id,
          // Anonymize: show anon label for user messages, real name for companion
          // System messages show "Sistem"
          displayName: m.is_system ? 'Sistem' : (m.is_companion ? m.display_name : formatAnonLabel(userAnonNumber)),
          text: m.text,
          isCompanion: m.is_companion || false,
          isSystem: m.is_system || false,
          createdAt: m.created_at,
        })),
      });
    }

    // POST - Send message as companion
    if (req.method === 'POST') {
      const { sessionId, content } = req.body || {};

      if (!sessionId || !content?.trim()) {
        return res.status(400).json({ error: 'Session ID and content required' });
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

      // Insert message as companion
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          message_id: uuidv4(),
          session_id: sessionId,
          sender_id: companion.companionId,
          display_name: companion.name,
          text: content.trim().slice(0, 2000),
          is_companion: true,
        })
        .select()
        .single();

      if (msgError) throw msgError;

      return res.status(201).json({
        success: true,
        message: {
          messageId: message.message_id,
          text: message.text,
          displayName: message.display_name,
          isCompanion: true,
          createdAt: message.created_at,
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Companion messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
