-- ============================================
-- Migration: Add Companion Read Tracking
-- Tujuan: Track when companion last read a chat session
-- ============================================

-- 1) Add companion_last_read_at column to chat_sessions
-- This tracks when the companion last viewed/read the session
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS companion_last_read_at TIMESTAMP WITH TIME ZONE NULL;

-- 2) Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_companion_last_read 
ON chat_sessions(companion_id, companion_last_read_at);

-- ============================================
-- Optional: Initialize existing sessions
-- Set companion_last_read_at to session creation time
-- ============================================
UPDATE chat_sessions 
SET companion_last_read_at = created_at 
WHERE companion_last_read_at IS NULL AND companion_id IS NOT NULL;

-- ============================================
-- Verification Query
-- ============================================
-- SELECT session_id, topic, companion_id, companion_last_read_at FROM chat_sessions;
