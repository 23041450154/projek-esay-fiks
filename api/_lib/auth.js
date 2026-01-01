/**
 * Authentication Helper Functions
 * JWT-based session management with httpOnly cookies
 */

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Get APP_SECRET from environment
 */
function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('APP_SECRET must be at least 32 characters');
  }
  return secret;
}

/**
 * Create a JWT session token
 * @param {Object} payload - Data to encode in token
 * @returns {string} JWT token
 */
function createToken(payload) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: '7d',
  });
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    return null;
  }
}

/**
 * Create session response headers (Set-Cookie)
 * @param {Object} userData - User data to store in session
 * @returns {Object} Headers object with Set-Cookie
 */
function createSessionCookie(userData) {
  const token = createToken(userData);
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cookieOptions = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    `SameSite=${isProduction ? 'Strict' : 'Lax'}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
  ];

  // Only add Secure flag in production (HTTPS)
  if (isProduction) {
    cookieOptions.push('Secure');
  }

  return {
    'Set-Cookie': cookieOptions.join('; '),
  };
}

/**
 * Create logout response headers (clear cookie)
 * @returns {Object} Headers object with Set-Cookie to clear
 */
function clearSessionCookie() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cookieOptions = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    `SameSite=${isProduction ? 'Strict' : 'Lax'}`,
    'Max-Age=0',
    'Path=/',
  ];

  // Only add Secure flag in production (HTTPS)
  if (isProduction) {
    cookieOptions.push('Secure');
  }

  return {
    'Set-Cookie': cookieOptions.join('; '),
  };
}

/**
 * Parse cookies from request header
 * @param {string} cookieHeader - Cookie header string
 * @returns {Object} Parsed cookies
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });

  return cookies;
}

/**
 * Get user from request (via cookie)
 * @param {Object} req - HTTP request object
 * @returns {Object|null} User data or null if not authenticated
 */
function getUserFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];

  if (!token) return null;

  const userData = verifyToken(token);
  return userData;
}

/**
 * Validate invite code
 * @param {string} code - Invite code to validate
 * @returns {boolean} True if valid
 */
function isValidInviteCode(code) {
  const validCodes = (process.env.INVITE_CODES || '').split(',').map(c => c.trim());
  return validCodes.includes(code);
}

/**
 * Sanitize string input
 * @param {string} input - Input to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}

module.exports = {
  createToken,
  verifyToken,
  createSessionCookie,
  clearSessionCookie,
  getUserFromRequest,
  isValidInviteCode,
  sanitizeInput,
  escapeHtml,
  COOKIE_NAME,
};
