const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

function generateToken(user) {
  return jwt.sign(
    { user_id: user.user_id, email: user.email, name: user.name },
    SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { generateToken, verifyToken };
