/**
 * Anonymous Number Helper
 * 
 * Assigns unique anonymous numbers (1-999) to users.
 * Companions will see "Pengguna 0XX" instead of real names.
 */

const { getSupabase } = require('./supabase');

/**
 * Format anonymous number to display label
 * @param {number} n - The anonymous number (1-999)
 * @returns {string} - Formatted label like "Pengguna 001"
 */
function formatAnonLabel(n) {
  if (!n || n < 1) return 'Pengguna ---';
  return 'Pengguna ' + String(n).padStart(3, '0');
}

/**
 * Ensure user has an anonymous number assigned
 * If not, generate a unique random number 1-999
 * 
 * @param {string} userId - The user's UUID
 * @returns {Promise<number|null>} - The assigned anon_number or null on error
 */
async function ensureAnonNumber(userId) {
  if (!userId) return null;

  const supabase = getSupabase();

  try {
    // 1) Check if user already has an anon_number
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('anon_number')
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('ensureAnonNumber - fetch error:', fetchError);
      return null;
    }

    // Already has a number, return it
    if (user && user.anon_number) {
      return user.anon_number;
    }

    // 2) Generate unique random number with retry logic
    const MAX_RETRIES = 20;
    let anonNumber = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Generate random number 1-999
      const candidate = Math.floor(Math.random() * 999) + 1;

      // Check if already taken
      const { data: existing, error: checkError } = await supabase
        .from('users')
        .select('user_id')
        .eq('anon_number', candidate)
        .maybeSingle();

      if (checkError) {
        console.error('ensureAnonNumber - check error:', checkError);
        continue;
      }

      // Number is available
      if (!existing) {
        anonNumber = candidate;
        break;
      }
    }

    if (!anonNumber) {
      console.error('ensureAnonNumber - could not find unique number after', MAX_RETRIES, 'attempts');
      return null;
    }

    // 3) Update user with the new anon_number
    const { error: updateError } = await supabase
      .from('users')
      .update({ anon_number: anonNumber })
      .eq('user_id', userId);

    if (updateError) {
      // Could be unique constraint violation if race condition
      console.error('ensureAnonNumber - update error:', updateError);
      
      // Try to fetch again in case it was assigned by another request
      const { data: retryUser } = await supabase
        .from('users')
        .select('anon_number')
        .eq('user_id', userId)
        .single();
      
      return retryUser?.anon_number || null;
    }

    console.log('ensureAnonNumber - assigned', anonNumber, 'to user', userId);
    return anonNumber;

  } catch (err) {
    console.error('ensureAnonNumber - unexpected error:', err);
    return null;
  }
}

/**
 * Get anonymous label for a user
 * Convenience function that combines ensureAnonNumber + formatAnonLabel
 * 
 * @param {string} userId - The user's UUID
 * @returns {Promise<string>} - The anonymous label like "Pengguna 042"
 */
async function getAnonLabel(userId) {
  const anonNumber = await ensureAnonNumber(userId);
  return formatAnonLabel(anonNumber);
}

module.exports = {
  formatAnonLabel,
  ensureAnonNumber,
  getAnonLabel,
};
