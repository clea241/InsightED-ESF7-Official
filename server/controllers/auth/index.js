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

// Create connection pool to 'users_database' containing user_schoolhead
const usersDbPoolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'users_database')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/users_database`;

const usersDatabasePool = new Pool({
  connectionString: usersDbPoolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

usersDatabasePool.on('error', (err) => {
  console.error('[users_database Pool Error]:', err.message);
});

// Fallback connection pool to 'insightEd'
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

// Standard official DepEd error prompt when a school ID is not found in user_schoolhead
function getUnregisteredSchoolError(inputSchoolId, isEmail) {
  const cleanId = isEmail ? inputSchoolId : String(inputSchoolId || '').replace(/^SCH-/i, '').trim();
  return `School ID ${cleanId} is not yet registered in the DepEd InsightED portal. Please verify your 6-digit School ID, register first, or contact your Division Office to register your station.`;
}

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

    // 1. Check user_schoolhead in users_database
    let user = null;
    try {
      const shRes = await usersDatabasePool.query(
        'SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM user_schoolhead WHERE uid = $1',
        [decoded.uid]
      );
      if (shRes.rows.length > 0) user = shRes.rows[0];
    } catch (e) {}

    // 2. Fallback to users table in insightEd
    if (!user) {
      const uRes = await insightEdPool.query(
        'SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM users WHERE uid = $1',
        [decoded.uid]
      ).catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) user = uRes.rows[0];
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

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

// ── POST /api/auth/migrate-login and /api/auth/master-login (Password Sign-In) ──
const handlePasswordLogin = async (req, res) => {
  const { identifier, password, school_id } = req.body;
  const inputSchoolId = (school_id || identifier || '').replace(/^SCH-/i, '').trim();

  if (!inputSchoolId || !password) {
    return res.status(400).json({ error: 'School ID and password are required' });
  }

  // Pilot shortcut
  const isPilotSeries = PILOT_SCHOOLS.includes(inputSchoolId) || /^199\d{3}$/.test(inputSchoolId);
  if (isPilotSeries && (password === PILOT_PASSWORD || password === inputSchoolId || password === 'deped123' || password === 'Pilot2026')) {
    const token = jwt.sign(
      { uid: `pilot-${inputSchoolId}`, email: `pilot-${inputSchoolId}@esf7.pilot`, role: 'school', school_id: inputSchoolId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `pilot-${inputSchoolId}`,
        email: `pilot-${inputSchoolId}@esf7.pilot`,
        role: 'school',
        account_category: 'school',
        region: 'PILOT',
        division: 'PILOT DIVISION',
        first_name: 'Pilot',
        last_name: `School ${inputSchoolId}`,
        school_id: inputSchoolId
      }
    });
  }

  try {
    const isEmail = inputSchoolId.includes('@');

    // 1. Query user_schoolhead in users_database by school_id column
    let user = null;
    try {
      const shQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;
      
      const shRes = await usersDatabasePool.query(shQuery, [isEmail ? inputSchoolId.toLowerCase() : inputSchoolId]);
      if (shRes.rows.length > 0) user = shRes.rows[0];
    } catch (e) {
      console.warn('[user_schoolhead query warning]:', e.message);
    }

    // 2. Secondary fallback: users table in insightEd
    if (!user) {
      const uQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;
      
      const uRes = await insightEdPool.query(uQuery, [isEmail ? inputSchoolId.toLowerCase() : inputSchoolId]).catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) user = uRes.rows[0];
    }

    if (!user) {
      const enhancedError = await getUnregisteredSchoolError(inputSchoolId, isEmail);
      return res.status(401).json({ error: enhancedError });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'No password configured for this account. Please sign in with your passcode.' });
    }

    // Match password against password_hash column
    let isPasswordValid = false;
    if (user.hash_version === 'bcrypt' || user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$')) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else {
      isPasswordValid = (password === user.password_hash);
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Incorrect password.' });
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

// ── POST /api/auth/passcode-login and /api/auth/pin-login (Passcode Sign-In) ──
const handlePasscodeLogin = async (req, res) => {
  const { passcode, pin, school_id, email, identifier } = req.body;
  const inputSchoolId = (school_id || identifier || email || '').replace(/^SCH-/i, '').trim();
  const inputPasscode = String(passcode || pin || '').trim();

  if (!inputSchoolId || !inputPasscode) {
    return res.status(400).json({ error: 'School ID and passcode are required' });
  }

  // Pilot shortcut
  const isPilotSeries = PILOT_SCHOOLS.includes(inputSchoolId) || /^1999\d{2}$/.test(inputSchoolId);
  if (isPilotSeries && (inputPasscode === '123456' || inputPasscode === '654321' || inputPasscode === '000000' || inputPasscode === inputSchoolId || inputPasscode === PILOT_PASSWORD)) {
    const token = jwt.sign(
      { uid: `pilot-${inputSchoolId}`, email: `pilot-${inputSchoolId}@esf7.pilot`, role: 'school', school_id: inputSchoolId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `pilot-${inputSchoolId}`,
        email: `pilot-${inputSchoolId}@esf7.pilot`,
        role: 'school',
        account_category: 'school',
        region: 'PILOT',
        division: 'PILOT DIVISION',
        first_name: 'Pilot',
        last_name: `School ${inputSchoolId}`,
        school_id: inputSchoolId
      }
    });
  }

  try {
    const isEmail = inputSchoolId.includes('@');

    // 1. Query user_schoolhead in users_database by school_id column
    let user = null;
    try {
      const shQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;
      
      const shRes = await usersDatabasePool.query(shQuery, [isEmail ? inputSchoolId.toLowerCase() : inputSchoolId]);
      if (shRes.rows.length > 0) user = shRes.rows[0];
    } catch (e) {
      console.warn('[user_schoolhead passcode query warning]:', e.message);
    }

    // 2. Secondary fallback: users table in insightEd
    if (!user) {
      const uQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;
      
      const uRes = await insightEdPool.query(uQuery, [isEmail ? inputSchoolId.toLowerCase() : inputSchoolId]).catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) user = uRes.rows[0];
    }

    if (!user) {
      const enhancedError = await getUnregisteredSchoolError(inputSchoolId, isEmail);
      return res.status(401).json({ error: enhancedError });
    }

    if (!user.passcode) {
      return res.status(401).json({ error: 'No passcode configured for this account. Please sign in with your password.' });
    }

    // Match inputPasscode against passcode column directly
    let isPasscodeValid = false;
    const isBcrypt = user.passcode.startsWith('$2b$') || user.passcode.startsWith('$2a$');
    if (isBcrypt) {
      try {
        isPasscodeValid = await bcrypt.compare(inputPasscode, user.passcode);
      } catch (e) {}
    } else {
      isPasscodeValid = (inputPasscode === String(user.passcode).trim());
    }

    if (!isPasscodeValid) {
      return res.status(401).json({ error: 'Incorrect passcode.' });
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

// Route mappings
router.post('/migrate-login', handlePasswordLogin);
router.post('/master-login', handlePasswordLogin);
router.post('/password-login', handlePasswordLogin);

router.post('/passcode-login', handlePasscodeLogin);
router.post('/pin-login', handlePasscodeLogin);

// POST /api/auth/verify-passcode
router.post('/verify-passcode', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
