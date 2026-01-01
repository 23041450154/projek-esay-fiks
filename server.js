/**
 * Express Server for SafeSpace
 * Deployment to Azure VPS with Ubuntu 22
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================
// Middleware
// ===================

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Parse cookies
app.use(cookieParser());

// Trust proxy (for rate limiting behind Nginx)
app.set('trust proxy', 1);

// ===================
// API Routes
// ===================

// Helper to wrap Vercel-style handlers
const wrapHandler = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Auth routes
app.all('/api/auth/login', wrapHandler(require('./api/auth/login')));
app.all('/api/auth/login-supabase', wrapHandler(require('./api/auth/login-supabase')));
app.all('/api/auth/logout', wrapHandler(require('./api/auth/logout')));

// User routes
app.all('/api/me', wrapHandler(require('./api/me')));

// Admin routes
app.all('/api/admin/login', wrapHandler(require('./api/admin/login')));
app.all('/api/admin/me', wrapHandler(require('./api/admin/me')));

// Companion routes
app.all('/api/companion/login', wrapHandler(require('./api/companion/login')));
app.all('/api/companion/auth', wrapHandler(require('./api/companion/auth')));
app.all('/api/companion/me', wrapHandler(require('./api/companion/me')));
app.all('/api/companion/messages', wrapHandler(require('./api/companion/messages')));
app.all('/api/companion/sessions', wrapHandler(require('./api/companion/sessions')));
app.all('/api/companion/users', wrapHandler(require('./api/companion/users')));
app.all('/api/companion/read', wrapHandler(require('./api/companion/read')));
app.all('/api/companion/close', wrapHandler(require('./api/companion/close')));

// Chat routes
app.all('/api/chat/messages', wrapHandler(require('./api/chat/messages')));
app.all('/api/chat/sessions', wrapHandler(require('./api/chat/sessions')));

// Other API routes
app.all('/api/companions', wrapHandler(require('./api/companions')));
app.all('/api/journal', wrapHandler(require('./api/journal')));
app.all('/api/mood', wrapHandler(require('./api/mood')));
app.all('/api/reports', wrapHandler(require('./api/reports')));

// ===================
// Static Files
// ===================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ===================
// Page Routes (SPA style)
// ===================

// Landing page as default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Catch-all for HTML pages
app.get('*.html', (req, res) => {
  const htmlFile = path.join(__dirname, 'public', path.basename(req.path));
  res.sendFile(htmlFile, (err) => {
    if (err) {
      res.status(404).send('Page not found');
    }
  });
});

// ===================
// Error Handling
// ===================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ===================
// Start Server
// ===================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SafeSpace server running on port ${PORT}`);
  console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
