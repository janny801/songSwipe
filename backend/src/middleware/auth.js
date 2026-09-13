const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'songswipe-super-secret-jwt-key-2024';

/**
 * Middleware to require valid JWT authentication
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in.',
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token',
    });
  }
}

/**
 * Optional authentication: attaches user if token is valid, but allows guest pass-through
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // Ignore invalid token and continue as guest
    }
  }
  next();
}

module.exports = {
  JWT_SECRET,
  requireAuth,
  optionalAuth,
};
