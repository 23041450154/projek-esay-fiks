/**
 * /api/chat/sessions
 * GET - List user's chat sessions
 * POST - Create new chat session
 * DELETE - Delete chat session (admin/companion only)
 */

const { v4: uuidv4 } = require('uuid');
const { getUserFromRequest, sanitizeInput } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');
const { standardRateLimit } = require('../_lib/rateLimit');

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
    // GET - List sessions
    // - Group chat (companion_id = null): visible to ALL users
    // - Companion chat (companion_id exists): only visible to creator
    // - Only show ACTIVE sessions (not closed)
    if (req.method === 'GET') {
      // Try to fetch with status column (may not exist yet)
      let sessions = [];
      let hasStatusColumn = true;

      // Try with status column first
      const { data: sessionsData, error } = await supabase
        .from('chat_sessions')
        .select(`
          session_id, 
          topic, 
          created_by, 
          created_at,
          companion_id,
          room_type,
          status,
          companions (
            name,
            specialty
          )
        `)
        .or(`created_by.eq.${user.userId},companion_id.is.null`)  // Own sessions OR group chats
        .order('created_at', { ascending: false });

      if (error) {
        // If column doesn't exist, try without status columns
        if (error.code === '42703') {
          hasStatusColumn = false;
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('chat_sessions')
            .select(`
              session_id, 
              topic, 
              created_by, 
              created_at,
              companion_id,
              companions (
                name,
                specialty
              )
            `)
            .or(`created_by.eq.${user.userId},companion_id.is.null`)
            .order('created_at', { ascending: false });

          if (fallbackError) throw fallbackError;
          sessions = fallbackData || [];
        } else {
          throw error;
        }
      } else {
        sessions = sessionsData || [];
      }

      // Filter out closed sessions (only show active)
      if (hasStatusColumn) {
        sessions = sessions.filter(s => s.status !== 'closed');
      }

      return res.status(200).json({
        sessions: sessions.map(s => ({
          sessionId: s.session_id,
          topic: s.topic,
          createdBy: s.created_by,
          companionId: s.companion_id,
          companionName: s.companions?.name || null,
          companionSpecialty: s.companions?.specialty || null,
          roomType: hasStatusColumn ? (s.room_type || 'private') : 'private',
          status: hasStatusColumn ? (s.status || 'active') : 'active',
          createdAt: s.created_at,
        })),
      });
    }

    // POST - Create new session with companion
    if (req.method === 'POST') {
      const { topic, companionId } = req.body || {};
      const cleanTopic = sanitizeInput(topic, 200);

      if (!cleanTopic || cleanTopic.length < 3) {
        return res.status(400).json({ 
          error: 'Topic is required (minimum 3 characters)' 
        });
      }

      // Validate companion if provided
      if (companionId) {
        const { data: companion, error: compError } = await supabase
          .from('companions')
          .select('companion_id, name')
          .eq('companion_id', companionId)
          .eq('is_active', true)
          .single();

        if (compError || !companion) {
          return res.status(400).json({ error: 'Invalid companion selected' });
        }
      }

      const sessionId = uuidv4();

      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          session_id: sessionId,
          created_by: user.userId,    // This is the user who owns the session
          topic: cleanTopic,
          companion_id: companionId || null,
        })
        .select(`
          session_id,
          topic,
          created_at,
          companion_id,
          companions (
            name,
            specialty
          )
        `)
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        session: {
          sessionId: data.session_id,
          topic: data.topic,
          companionId: data.companion_id,
          companionName: data.companions?.name || null,
          companionSpecialty: data.companions?.specialty || null,
          status: 'active',
          createdAt: data.created_at,
        },
      });
    }

    // DELETE - Delete chat session (creator or companion/admin can delete)
    if (req.method === 'DELETE') {
      // Get sessionId from query string
      const { sessionId } = req.query || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Check if session exists and get info
      const { data: session, error: sessError } = await supabase
        .from('chat_sessions')
        .select('session_id, created_by, companion_id')
        .eq('session_id', sessionId)
        .single();

      if (sessError || !session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check permission: creator can delete their own, or user is admin/companion
      const isCreator = session.created_by === user.userId;
      const isAdmin = user.isAdmin === true; // For future admin users
      
      if (!isCreator && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to delete this session' });
      }

      // Delete messages first (foreign key constraint)
      await supabase
        .from('messages')
        .delete()
        .eq('session_id', sessionId);

      // Delete the session
      const { error: deleteError } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('session_id', sessionId);

      if (deleteError) throw deleteError;

      return res.status(200).json({
        success: true,
        message: 'Session deleted successfully',
      });
    }

    // PUT - Update session (close it) - DISABLED until status column is added
    if (req.method === 'PUT') {
      const { sessionId, status } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Status column doesn't exist yet, just return success
      return res.status(200).json({
        success: true,
        message: 'Session status update not yet implemented',
        sessionId,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Chat sessions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
