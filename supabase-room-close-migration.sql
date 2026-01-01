-- ============================================
-- Migration: Add Room Type and Close Status
-- Tujuan: Support closing group rooms by companions
-- ============================================

-- 1) Add room_type column to distinguish private vs group chats
-- Default to 'private' for existing sessions
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT 'private';

-- 2) Add status column for active/closed rooms
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 3) Add closed_at timestamp
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE NULL;

-- 4) Add closed_by to track who closed the room
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS closed_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL;

-- 5) Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_room_type ON chat_sessions(room_type);

-- ============================================
-- Add constraint to validate room_type and status values
-- ============================================
-- Note: These constraints help maintain data integrity
-- room_type: 'private' or 'group'
-- status: 'active' or 'closed'

-- If you want to enforce constraints (optional):
-- ALTER TABLE chat_sessions ADD CONSTRAINT check_room_type 
--   CHECK (room_type IN ('private', 'group'));
-- ALTER TABLE chat_sessions ADD CONSTRAINT check_status 
--   CHECK (status IN ('active', 'closed'));

-- ============================================
-- Verification Queries
-- ============================================
-- SELECT session_id, topic, room_type, status, closed_at FROM chat_sessions;
