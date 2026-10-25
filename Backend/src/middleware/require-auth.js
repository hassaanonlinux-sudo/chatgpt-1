const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authorization = req.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);

  if (!match) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(match[1], process.env.ACCESS_TOKEN_SECRET);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      return res.status(401).json({ error: 'Invalid access token.' });
    }
    req.user = { id: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

module.exports = requireAuth;
