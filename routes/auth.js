const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const sendOTPviaEmail = require('../utils/email'); // Adjust path


const router = express.Router();



const otpStore = new Map(); // In-memory OTP store (use Redis in production)
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}


//send-otp 

// ⬅️ OTP Request Route
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const otp = generateOTP();
    otpStore.set(email, otp);

    await sendOTPviaEmail(email, otp);

    return res.status(200).json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("OTP error:", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});








// Generate custom user_id like MMK_U_1, MMK_U_2...
const generateUserId = (id) => `MMK_U_${id}`;




// Signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password,phone, otp } = req.body;


    const validOTP = otpStore.get(email);
    if (!validOTP || validOTP !== otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }
    otpStore.delete(email); // Invalidate used OTP


        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }


    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length > 0) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO users (name, email, password, phone) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, phone]
    );

    const userId = `MMK_U_${result.insertId}`;
    await db.query('UPDATE users SET user_id = ? WHERE id = ?', [userId, result.insertId]);

    req.session.user = { id: result.insertId, name, email,phone, user_id: userId };
    return res.status(200).json({ message: 'User registered', user_id: userId, name, email });
  } catch (err) {
    console.error('Signup error:', err); // ✅ Still logs the error
    return res.status(500).json({ error: 'Server error during registration' });
  }
});




// User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      user_id: user.user_id,
    };

    return res.json({ message: 'Login successful', user_id: user.user_id, name: user.name, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
});





//admin_login



router.post('/admin_login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [results] = await db.query('SELECT * FROM admin WHERE email = ?', [email]);
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const admin = results[0];
    if (password !== admin.password) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.admin = {
      id: admin.id,
      email: admin.email,

    };

    return res.json({ message: 'Login successful', admin_id: admin.id, email: admin.email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
});


//admin_session
// Check Session
router.get('/admin_session', (req, res) => {
  if (req.session.admin) {
    return res.json({ loggedIn: true, admin: req.session.admin });
  } else {
    return res.json({ loggedIn: false });
  }
});

//admin_logout

router.post('/admin_logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

module.exports = router;



// Check Session
router.get('/session', (req, res) => {
  if (req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  } else {
    return res.json({ loggedIn: false });
  }
});



// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});




// Forgot Password - Request OTP
router.post('/forgot-password/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    const otp = generateOTP();
    otpStore.set(email, otp);

    await sendOTPviaEmail(email, otp);
    return res.status(200).json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("Forgot password OTP error:", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});




// Forgot Password - Verify OTP and Reset
router.post('/forgot-password/reset', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const storedOTP = otpStore.get(email);
  if (!storedOTP || storedOTP !== otp) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  try {
    otpStore.delete(email); // Invalidate OTP

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const [results] = await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Password reset error:", err);
    return res.status(500).json({ error: "Server error while resetting password" });
  }
});









module.exports = router;
