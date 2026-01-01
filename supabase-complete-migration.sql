-- ============================================
-- MIGRATION LENGKAP: SafeSpace Database Updates
-- Jalankan semua query ini di Supabase SQL Editor
-- ============================================

-- ============================================
-- 1) ANONYMOUS NUMBER untuk Users
-- Tujuan: Anonymize user identities for companions
-- ============================================

-- Add anon_number column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS anon_number INTEGER NULL;

-- Add UNIQUE constraint (skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_anon_number_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_anon_number_unique UNIQUE (anon_number);
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_users_anon_number ON users(anon_number);

-- Backfill existing users with random anon_number
DO $$
DECLARE
  user_record RECORD;
  new_number INTEGER;
  attempts INTEGER;
  max_attempts CONSTANT INTEGER := 50;
BEGIN
  FOR user_record IN 
    SELECT user_id FROM users WHERE anon_number IS NULL
  LOOP
    attempts := 0;
    LOOP
      new_number := floor(random() * 999 + 1)::INTEGER;
      IF NOT EXISTS (SELECT 1 FROM users WHERE anon_number = new_number) THEN
        UPDATE users SET anon_number = new_number WHERE user_id = user_record.user_id;
        EXIT;
      END IF;
      attempts := attempts + 1;
      IF attempts >= max_attempts THEN
        RAISE NOTICE 'Could not assign anon_number for user %, skipping', user_record.user_id;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- 2) COMPANION READ TRACKING
-- Tujuan: Track when companion last read a chat session
-- ============================================

-- Add companion_last_read_at column
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS companion_last_read_at TIMESTAMP WITH TIME ZONE NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_companion_last_read 
ON chat_sessions(companion_id, companion_last_read_at);

-- Initialize existing sessions (set to now so they appear as read)
UPDATE chat_sessions 
SET companion_last_read_at = NOW() 
WHERE companion_last_read_at IS NULL AND companion_id IS NOT NULL;

-- ============================================
-- 3) ROOM TYPE AND CLOSE STATUS
-- Tujuan: Support closing group rooms by companions
-- ============================================

-- Add room_type column (private or group)
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT 'private';

-- Add status column (active or closed)
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add closed_at timestamp
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE NULL;

-- Add closed_by reference
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS closed_by UUID NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_room_type ON chat_sessions(room_type);

-- ============================================
-- 4) SYSTEM MESSAGES SUPPORT
-- Tujuan: Support system messages in chat
-- ============================================

-- Add is_system column to messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- Add is_companion column if not exists
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_companion BOOLEAN DEFAULT FALSE;

-- Add sender_id column if not exists (for tracking)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS sender_id UUID NULL;

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify the migration worked
-- ============================================

-- Check users table
-- SELECT user_id, display_name, anon_number FROM users ORDER BY anon_number LIMIT 10;

-- Check chat_sessions table
-- SELECT session_id, topic, companion_id, companion_last_read_at, room_type, status FROM chat_sessions LIMIT 10;

-- Check messages table structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages';

-- ============================================
-- DONE! Refresh your companion dashboard.
-- ============================================
