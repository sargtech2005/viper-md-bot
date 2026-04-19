const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'viper_secret_change_me';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

// Middleware: requires auth
function requireAuth(req, res, next) {
  const token = req.cookies?.viper_token;
  if (!token) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
    return res.redirect('/login.html');
  }
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.clearCookie('viper_token');
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expired' });
    return res.redirect('/login.html');
  }
}

// Middleware: requires admin
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user?.is_admin) {
      if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Admin only' });
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
