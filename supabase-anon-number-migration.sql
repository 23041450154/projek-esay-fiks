-- ============================================
-- Migration: Add Anonymous Number for Users
-- Tujuan: Anonymize user identities for companions
-- ============================================

-- 1) Add anon_number column to users table
-- This number will be displayed as "Pengguna 0XX" to companions
ALTER TABLE users
ADD COLUMN IF NOT EXISTS anon_number INTEGER NULL;

-- 2) Add UNIQUE constraint to ensure no duplicate numbers
-- Each user gets a unique anonymous identifier
ALTER TABLE users
ADD CONSTRAINT users_anon_number_unique UNIQUE (anon_number);

-- 3) Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_anon_number ON users(anon_number);

-- ============================================
-- Optional: Backfill existing users with anon_number
-- Run this separately if you have existing users
-- ============================================

-- This function assigns anon_number to all existing users without one
-- Each user gets a unique number from 1 to 999
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
      -- Generate random number 1-999
      new_number := floor(random() * 999 + 1)::INTEGER;
      
      -- Check if number is already taken
      IF NOT EXISTS (SELECT 1 FROM users WHERE anon_number = new_number) THEN
        UPDATE users SET anon_number = new_number WHERE user_id = user_record.user_id;
        EXIT;
      END IF;
      
      attempts := attempts + 1;
      IF attempts >= max_attempts THEN
        RAISE EXCEPTION 'Could not assign unique anon_number after % attempts', max_attempts;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- Verification Query
-- Run this to verify the migration
-- ============================================
-- SELECT user_id, display_name, anon_number FROM users ORDER BY anon_number;
