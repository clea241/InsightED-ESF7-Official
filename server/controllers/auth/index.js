const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../db');
require('dotenv').config();

// ── Hardcoded Pilot School Credentials ────────────────────────────────────
// These are for pilot testing only. Remove before official rollout.
// Prefix 1 = Elementary | Prefix 3 = JHS/SHS | Prefix 5 = All Offerings
const PILOT_SCHOOLS = [
  '305337', '101190', '305280', '110416', '500552',
  '500484', '124214', '125789', '305514', '131280',
  '199999', '199888', '130113', '123325', '104126', '114196',
  '123458', '312311', '300844', '300744', '500273',
  '500522', '500369'
];
const PILOT_PASSWORD = 'Pilot2026!';

// Create a connection pool to the main 'insightEd' database containing the users table
const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

insightEdPool.on('error', (err) => {
  console.error('[Auth DB Pool Error]:', err.message);
});

const JWT_SECRET = process.env.JWT_SECRET || 'STRIDE_INSIGHTED_SECRET_2026_KEY_PROD';

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.uid && decoded.uid.startsWith('pilot-')) {
      const pilotId = decoded.uid.split('-')[1];
      return res.json({
        uid: decoded.uid,
        role: 'school',
        email: decoded.email,
        school_id: pilotId,
        region: 'PILOT',
        division: 'PILOT DIVISION',
        first_name: 'Pilot',
        last_name: `School ${pilotId}`
      });
    }

    const query = 'SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM users WHERE uid = $1';
    const result = await insightEdPool.query(query, [decoded.uid]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      uid: user.uid,
      role: user.role,
      email: user.email,
      school_id: user.school_id,
      region: user.region,
      division: user.division,
      account_category: user.account_category || user.role,
      first_name: user.first_name,
      last_name: user.last_name
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// POST /api/auth/migrate-login and /api/auth/master-login
const handleLogin = async (req, res) => {
  const { identifier, password, school_id } = req.body;
  const inputId = (school_id || identifier || '').trim();

  if (!inputId || !password) {
    return res.status(400).json({ error: 'School ID and password are required' });
  }

  // ── Pilot school shortcut login (includes 199901-199999 sandbox range) ────
  const isPilotSeries = PILOT_SCHOOLS.includes(inputId) || /^199\d{3}$/.test(inputId);
  if (isPilotSeries && (password === PILOT_PASSWORD || password === inputId || password === 'deped123' || password === 'Pilot2026')) {
    const token = jwt.sign(
      { uid: `pilot-${inputId}`, email: `pilot-${inputId}@esf7.pilot`, role: 'school', school_id: inputId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `pilot-${inputId}`,
        email: `pilot-${inputId}@esf7.pilot`,
        role: 'school',
        account_category: 'school',
        region: 'PILOT',
        division: 'PILOT DIVISION',
        first_name: 'Pilot',
        last_name: `School ${inputId}`,
        school_id: inputId
      }
    });
  }

  try {
    const isEmail = inputId.includes('@');
    const isSchoolId = !isEmail && /^\d{6,}$/.test(inputId);

    const query = isSchoolId
      ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id FROM users WHERE school_id = $1 AND disabled = false`
      : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id FROM users WHERE LOWER(email) = $1 AND disabled = false`;

    const result = await insightEdPool.query(query, [isSchoolId ? inputId : inputId.toLowerCase()]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Username does not exist. Kindly register first.' });
    }

    const user = result.rows[0];
    
    // Validate password using bcrypt
    let isValid = false;
    if (user.hash_version === 'bcrypt' || user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$')) {
      isValid = await bcrypt.compare(password, user.password_hash);
    } else {
      isValid = (password === user.password_hash);
    }

    if (!isValid) {
      return res.status(401).json({ error: 'The username exists but does not match the password you provided.' });
    }

    const token = jwt.sign(
      { uid: user.uid, email: user.email, role: user.role, school_id: user.school_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        uid: user.uid,
        email: user.email,
        role: user.role,
        region: user.region,
        division: user.division,
        account_category: user.account_category || user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        school_id: user.school_id
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.post('/migrate-login', handleLogin);
router.post('/master-login', handleLogin);

// POST /api/auth/pin-login
router.post('/pin-login', async (req, res) => {
  const { pin, school_id, email } = req.body;
  const inputId = (school_id || email || '').trim();

  if (!inputId || !pin) {
    return res.status(400).json({ error: 'Identifier and PIN are required' });
  }

  try {
    const isPilotSeries = PILOT_SCHOOLS.includes(inputId) || /^1999\d{2}$/.test(inputId);
    if (isPilotSeries && (pin === '123456' || pin === '654321' || pin === '000000')) {
      const token = jwt.sign(
        { uid: `pilot-${inputId}`, email: `pilot-${inputId}@esf7.pilot`, role: 'school', school_id: inputId },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      return res.json({
        success: true,
        token,
        user: {
          uid: `pilot-${inputId}`,
          email: `pilot-${inputId}@esf7.pilot`,
          role: 'school',
          account_category: 'school',
          region: 'PILOT',
          division: 'PILOT DIVISION',
          first_name: 'Pilot',
          last_name: `School ${inputId}`,
          school_id: inputId
        }
      });
    }

    const isEmail = inputId.includes('@');
    const isSchoolId = !isEmail && /^\d{6,}$/.test(inputId);

    const query = isSchoolId
      ? `SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM users WHERE school_id = $1 AND disabled = false`
      : `SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM users WHERE LOWER(email) = $1 AND disabled = false`;

    const result = await insightEdPool.query(query, [isSchoolId ? inputId : inputId.toLowerCase()]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Username does not exist. Kindly register first.' });
    }

    const user = result.rows[0];
    if (!user.passcode) {
      return res.status(401).json({ error: 'No PIN setup for this account.' });
    }

    const isBcryptHash = user.passcode.startsWith('$2b$') || user.passcode.startsWith('$2a$');
    const isValidPin = isBcryptHash
      ? await bcrypt.compare(pin, user.passcode)
      : (pin === user.passcode);

    if (!isValidPin) {
      return res.status(401).json({ error: 'The username exists but does not match the PIN you provided.' });
    }

    const token = jwt.sign(
      { uid: user.uid, email: user.email, role: user.role, school_id: user.school_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        uid: user.uid,
        email: user.email,
        role: user.role,
        region: user.region,
        division: user.division,
        account_category: user.account_category || user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        school_id: user.school_id
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-passcode
router.post('/verify-passcode', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
