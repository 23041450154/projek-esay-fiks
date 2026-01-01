/**
 * /api/chat/messages
 * GET - Fetch messages (supports polling with ?after=<ISO>)
 * POST - Send a message
 */

const { v4: uuidv4 } = require('uuid');
const { getUserFromRequest, sanitizeInput, escapeHtml } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');
const { standardRateLimit } = require('../_lib/rateLimit');

// Risk keywords for basic detection (case-insensitive)
// These are in Indonesian and English for broader coverage
const RISK_KEYWORDS = [
  // Indonesian
  'bunuh diri', 'ingin mati', 'tidak ingin hidup', 'mengakhiri hidup',
  'menyakiti diri', 'melukai diri', 'potong nadi', 'gantung diri',
  'overdosis', 'minum racun', 'lompat dari',
  // English
  'kill myself', 'want to die', 'end my life', 'suicide',
  'self harm', 'cut myself', 'hurt myself', 'overdose',
  'jump off', 'hang myself',
];

/**
 * Check if text contains risk keywords
 * @param {string} text - Text to check
 * @returns {boolean} True if risk detected
 */
function detectRisk(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return RISK_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

module.exports = async function handler(req, res) {
  // Apply rate limiting
  if (standardRateLimit(req, res)) return;

  // Check authentication
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!user.hasConsented) {
    return res.status(403).json({ error: 'Consent required' });
  }

  const supabase = getSupabase();

  try {
    // GET - Fetch messages (for polling)
    if (req.method === 'GET') {
      const { sessionId, after } = req.query || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Verify session exists AND check access permission
      // Also get status and room_type for closed room handling
      let session = null;
      let hasStatusColumn = true;

      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('session_id, created_by, companion_id, room_type, status')
        .eq('session_id', sessionId)
        .single();

      if (sessionError) {
        // If column doesn't exist, try without status columns
        if (sessionError.code === '42703') {
          hasStatusColumn = false;
          const { data: fallbackSession, error: fallbackError } = await supabase
            .from('chat_sessions')
            .select('session_id, created_by, companion_id')
            .eq('session_id', sessionId)
            .single();

          if (fallbackError || !fallbackSession) {
            return res.status(404).json({ error: 'Session not found' });
          }
          session = fallbackSession;
        } else {
          return res.status(404).json({ error: 'Session not found' });
        }
      } else {
        session = sessionData;
      }

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check access permission:
      // - Group chat (companion_id = null): everyone can access
      // - Companion chat (companion_id exists): only creator can access
      if (session.companion_id !== null && session.created_by !== user.userId) {
        return res.status(403).json({ error: 'Access denied to this session' });
      }

      // Build query - note: display_name is in messages table, not users
      let query = supabase
        .from('messages')
        .select(`
          message_id,
          session_id,
          user_id,
          sender_id,
          display_name,
          text,
          created_at,
          is_system,
          is_companion
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      // Filter by "after" timestamp if provided (for polling)
      if (after) {
        query = query.gt('created_at', after);
      }

      const { data: messages, error } = await query;

      if (error) throw error;

      // Return session status along with messages
      return res.status(200).json({
        messages: messages.map(m => ({
          messageId: m.message_id,
          sessionId: m.session_id,
          userId: m.user_id || m.sender_id,
          displayName: m.display_name,
          text: escapeHtml(m.text),
          riskFlag: false, // Risk flag not implemented yet
          createdAt: m.created_at,
          isOwn: m.user_id === user.userId,
          isCompanion: m.is_companion || false,
          isSystem: m.is_system || false,
        })),
        session: {
          sessionId: session.session_id,
          roomType: hasStatusColumn ? (session.room_type || 'private') : 'private',
          status: hasStatusColumn ? (session.status || 'active') : 'active',
        },
        serverTime: new Date().toISOString(),
      });
    }

    // POST - Send a message
    if (req.method === 'POST') {
      const { sessionId, text } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const cleanText = sanitizeInput(text, 2000);
      if (!cleanText || cleanText.length < 1) {
        return res.status(400).json({ error: 'Message text is required' });
      }

      // Verify session exists AND check access permission
      // Also check status to prevent sending to closed rooms
      let session = null;
      let hasStatusColumn = true;

      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('session_id, created_by, companion_id, status')
        .eq('session_id', sessionId)
        .single();

      if (sessionError) {
        // If column doesn't exist, try without status column
        if (sessionError.code === '42703') {
          hasStatusColumn = false;
          const { data: fallbackSession, error: fallbackError } = await supabase
            .from('chat_sessions')
            .select('session_id, created_by, companion_id')
            .eq('session_id', sessionId)
            .single();

          if (fallbackError || !fallbackSession) {
            return res.status(404).json({ error: 'Session not found' });
          }
          session = fallbackSession;
        } else {
          return res.status(404).json({ error: 'Session not found' });
        }
      } else {
        session = sessionData;
      }

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check if room is closed
      if (hasStatusColumn && session.status === 'closed') {
        return res.status(400).json({ error: 'Ruang chat ini telah ditutup dan tidak dapat menerima pesan baru.' });
      }

      // Check access permission:
      // - Group chat (companion_id = null): everyone can send
      // - Companion chat (companion_id exists): only creator can send
      if (session.companion_id !== null && session.created_by !== user.userId) {
        return res.status(403).json({ error: 'Access denied to this session' });
      }

      // Check for risk keywords (for logging/future use)
      const hasRisk = detectRisk(cleanText);

      const messageId = uuidv4();

      // Save message - display_name stored in messages table
      const { data: message, error: insertError } = await supabase
        .from('messages')
        .insert({
          message_id: messageId,
          session_id: sessionId,
          user_id: user.userId,
          display_name: user.displayName,
          text: cleanText,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const response = {
        success: true,
        message: {
          messageId: message.message_id,
          sessionId: message.session_id,
          userId: message.user_id,
          displayName: message.display_name,
          text: escapeHtml(cleanText),
          riskFlag: hasRisk,
          createdAt: message.created_at,
          isOwn: true,
        },
      };

      // If risk detected, add warning to response
      if (hasRisk) {
        response.warning = {
          type: 'risk_detected',
          message: 'Kami mendeteksi bahwa kamu mungkin sedang dalam kondisi yang sulit. ' +
            'Ingat, kamu tidak sendirian. Jika kamu membutuhkan bantuan segera, ' +
            'silakan hubungi layanan krisis atau kunjungi tab "Butuh Bantuan Sekarang".',
          resources: [
            { name: 'Into The Light Indonesia', contact: '119 ext 8' },
            { name: 'Yayasan Pulih', contact: '(021) 788-42580' },
          ],
        };
      }

      return res.status(201).json(response);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Chat messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
