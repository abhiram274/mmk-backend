const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  }

  return res.status(401).json({ error: 'No token provided' });
}

module.exports = authenticateJWT;
