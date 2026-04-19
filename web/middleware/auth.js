const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'viper_secret_change_me';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

// Middleware: requires auth
// FIX: use req.originalUrl not req.path — inside a sub-router, req.path is only
// the suffix (e.g. "/me"), so the old "/api/" check never matched, causing the
// middleware to REDIRECT instead of returning 401. The browser followed the redirect
// to /login.html, got a 200, and the frontend mistook that for a valid session.
function requireAuth(req, res, next) {
  const token  = req.cookies?.viper_token;
  const isApi  = req.originalUrl.startsWith('/api/');
  if (!token) {
    if (isApi) return res.status(401).json({ error: 'Not authenticated' });
    return res.redirect('/login.html');
  }
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.clearCookie('viper_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    if (isApi) return res.status(401).json({ error: 'Session expired' });
    return res.redirect('/login.html');
  }
}

// Middleware: requires admin
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user?.is_admin) {
      if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'Admin only' });
      return res.redirect('/dashboard.html');
    }
    next();
  });
}

// Soft auth (doesn't redirect, just sets req.user if valid)
function softAuth(req, res, next) {
  const token = req.cookies?.viper_token;
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch {}
  }
  next();
}

module.exports = { signToken, requireAuth, requireAdmin, softAuth };
