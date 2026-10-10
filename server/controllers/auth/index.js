const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { resolveTestDivision } = require("../../utils/divisionTestRegistry");
require("dotenv").config();

// ── Hardcoded Pilot School Credentials ────────────────────────────────────
// These are for pilot testing only. Remove before official rollout.
// Prefix 1 = Elementary | Prefix 3 = JHS/SHS | Prefix 5 = All Offerings
const PILOT_SCHOOLS = [
  "305337",
  "101190",
  "305280",
  "110416",
  "500552",
  "500484",
  "124214",
  "125789",
  "305514",
  "131280",
  "199999",
  "199888",
  "130113",
  "123325",
  "104126",
  "114196",
  "123458",
  "312311",
  "300844",
  "300744",
  "500273",
  "500522",
  "500369",
];
const PILOT_PASSWORD = process.env.PILOT_PASSWORD;
const {
  authLimiter,
  passcodeLimiter,
} = require("../../middleware/rateLimiter");
const { validateRequest, z } = require("../../middleware/validate");
const { usersDatabasePool, insightEdPool } = require("../../db");

const { getJwtSecret } = require("../../utils/jwtSecret");

// Standard official DepEd error prompt when a school ID is not found in user_schoolhead
function getUnregisteredSchoolError(inputSchoolId, isEmail) {
  const cleanId = isEmail
    ? inputSchoolId
    : String(inputSchoolId || "")
        .replace(/^SCH-/i, "")
        .trim();
  return `School ID ${cleanId} is not yet registered in the DepEd InsightED portal. Please verify your 6-digit School ID, register first, or contact your Division Office to register your station.`;
}

// GET /api/auth/me
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.uid && decoded.uid.startsWith("divtest-")) {
      const schId = decoded.school_id || decoded.uid.replace("divtest-", "");
      const testDiv = resolveTestDivision(schId);
      return res.json({
        uid: decoded.uid,
        role: "school",
        email:
          decoded.email ||
          (testDiv ? testDiv.handle : `div-${schId}@esf7.test`),
        school_id: schId,
        region: testDiv ? testDiv.region : decoded.region || "REGION V",
        division: testDiv
          ? testDiv.division
          : decoded.division || "DIVISION TEST",
        account_category: "school",
        first_name: "School Head",
        last_name: testDiv ? testDiv.schoolName : `Demo School ${schId}`,
      });
    }

    if (decoded.uid && decoded.uid.startsWith("pilot-")) {
      const pilotId = decoded.uid.split("-")[1];
      return res.json({
        uid: decoded.uid,
        role: "school",
        email: decoded.email,
        school_id: pilotId,
        region: "PILOT",
        division: "PILOT DIVISION",
        first_name: "Pilot",
        last_name: `School ${pilotId}`,
      });
    }

    // 1. Check user_schoolhead in users_database
    let user = null;
    try {
      const shRes = await usersDatabasePool.query(
        "SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM user_schoolhead WHERE uid = $1",
        [decoded.uid],
      );
      if (shRes.rows.length > 0) user = shRes.rows[0];
    } catch (e) {}

    // 2. Fallback to users table in insightEd
    if (!user) {
      const uRes = await insightEdPool
        .query(
          "SELECT uid, email, role, region, division, office, account_category, passcode, first_name, last_name, school_id FROM users WHERE uid = $1",
          [decoded.uid],
        )
        .catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) user = uRes.rows[0];
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
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
      last_name: user.last_name,
    });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// ── POST /api/auth/migrate-login and /api/auth/master-login (Password Sign-In) ──
const handlePasswordLogin = async (req, res) => {
  const { identifier, password, school_id } = req.body;
  const inputSchoolId = (school_id || identifier || "")
    .replace(/^SCH-/i, "")
    .trim();

  if (!inputSchoolId || !password) {
    return res
      .status(400)
      .json({ error: "School ID and password are required" });
  }

  // 230 Division & 7 MCOC Archetype Test Accounts Shortcut
  const testDiv = resolveTestDivision(inputSchoolId);
  if (
    testDiv &&
    (password === "123456" ||
      (PILOT_PASSWORD && password === PILOT_PASSWORD) ||
      password === "deped123" ||
      password === testDiv.schoolId ||
      password === testDiv.handle ||
      password === testDiv.shortHandle)
  ) {
    const token = jwt.sign(
      {
        uid: `divtest-${testDiv.schoolId}`,
        email: testDiv.handle,
        role: "school",
        school_id: testDiv.schoolId,
        region: testDiv.region,
        division: testDiv.division,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `divtest-${testDiv.schoolId}`,
        email: testDiv.handle,
        role: "school",
        account_category: "school",
        region: testDiv.region,
        division: testDiv.division,
        first_name: "School Head",
        last_name: testDiv.schoolName,
        school_id: testDiv.schoolId,
      },
    });
  }

  // Pilot shortcut
  const isPilotSeries =
    PILOT_SCHOOLS.includes(inputSchoolId) || /^199\d{3}$/.test(inputSchoolId);
  if (
    isPilotSeries &&
    ((PILOT_PASSWORD && password === PILOT_PASSWORD) ||
      password === inputSchoolId ||
      password === "deped123")
  ) {
    const token = jwt.sign(
      {
        uid: `pilot-${inputSchoolId}`,
        email: `pilot-${inputSchoolId}@esf7.pilot`,
        role: "school",
        school_id: inputSchoolId,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `pilot-${inputSchoolId}`,
        email: `pilot-${inputSchoolId}@esf7.pilot`,
        role: "school",
        account_category: "school",
        region: "PILOT",
        division: "PILOT DIVISION",
        first_name: "Pilot",
        last_name: `School ${inputSchoolId}`,
        school_id: inputSchoolId,
      },
    });
  }

  try {
    const isEmail = inputSchoolId.includes("@");

    // 1. Query user_schoolhead in users_database by school_id column
    let user = null;
    try {
      const shQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;

      const shRes = await usersDatabasePool.query(shQuery, [
        isEmail ? inputSchoolId.toLowerCase() : inputSchoolId,
      ]);
      if (shRes.rows.length > 0) user = shRes.rows[0];
    } catch (e) {
      console.warn("[user_schoolhead query warning]:", e.message);
    }

    // 2. Secondary fallback: users table in insightEd
    if (!user) {
      const uQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;

      const uRes = await insightEdPool
        .query(uQuery, [isEmail ? inputSchoolId.toLowerCase() : inputSchoolId])
        .catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) user = uRes.rows[0];
    }

    if (!user) {
      const enhancedError = await getUnregisteredSchoolError(
        inputSchoolId,
        isEmail,
      );
      return res.status(401).json({ error: enhancedError });
    }

    if (!user.password_hash) {
      return res.status(401).json({
        error:
          "No password configured for this account. Please sign in with your passcode.",
      });
    }

    // Match password against password_hash column
    let isPasswordValid = false;
    if (
      user.hash_version === "bcrypt" ||
      user.password_hash.startsWith("$2b$") ||
      user.password_hash.startsWith("$2a$")
    ) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else {
      isPasswordValid = password === user.password_hash;
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const token = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        role: user.role,
        school_id: user.school_id,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
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
        school_id: user.school_id,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/auth/passcode-login and /api/auth/pin-login (Passcode Sign-In) ──
const handlePasscodeLogin = async (req, res) => {
  const { passcode, pin, school_id, email, identifier } = req.body;
  const inputSchoolId = (school_id || identifier || email || "")
    .replace(/^SCH-/i, "")
    .trim();
  const inputPasscode = String(passcode || pin || "").trim();

  if (!inputSchoolId || !inputPasscode) {
    return res
      .status(400)
      .json({ error: "School ID and passcode are required" });
  }

  // 230 Division & 7 MCOC Archetype Test Accounts Shortcut
  const testDiv = resolveTestDivision(inputSchoolId);
  if (
    testDiv &&
    (inputPasscode === "123456" ||
      inputPasscode === "654321" ||
      inputPasscode === "000000" ||
      (PILOT_PASSWORD && inputPasscode === PILOT_PASSWORD) ||
      inputPasscode === "deped123" ||
      inputPasscode === testDiv.schoolId ||
      inputPasscode === testDiv.handle ||
      inputPasscode === testDiv.shortHandle)
  ) {
    const token = jwt.sign(
      {
        uid: `divtest-${testDiv.schoolId}`,
        email: testDiv.handle,
        role: "school",
        school_id: testDiv.schoolId,
        region: testDiv.region,
        division: testDiv.division,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `divtest-${testDiv.schoolId}`,
        email: testDiv.handle,
        role: "school",
        account_category: "school",
        region: testDiv.region,
        division: testDiv.division,
        first_name: "School Head",
        last_name: testDiv.schoolName,
        school_id: testDiv.schoolId,
      },
    });
  }

  // Pilot shortcut
  const isPilotSeries =
    PILOT_SCHOOLS.includes(inputSchoolId) || /^1999\d{2}$/.test(inputSchoolId);
  if (
    isPilotSeries &&
    (inputPasscode === "123456" ||
      inputPasscode === "654321" ||
      inputPasscode === "000000" ||
      inputPasscode === inputSchoolId ||
      (PILOT_PASSWORD && inputPasscode === PILOT_PASSWORD))
  ) {
    const token = jwt.sign(
      {
        uid: `pilot-${inputSchoolId}`,
        email: `pilot-${inputSchoolId}@esf7.pilot`,
        role: "school",
        school_id: inputSchoolId,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
    );
    return res.json({
      success: true,
      token,
      user: {
        uid: `pilot-${inputSchoolId}`,
        email: `pilot-${inputSchoolId}@esf7.pilot`,
        role: "school",
        account_category: "school",
        region: "PILOT",
        division: "PILOT DIVISION",
        first_name: "Pilot",
        last_name: `School ${inputSchoolId}`,
        school_id: inputSchoolId,
      },
    });
  }

  try {
    const isEmail = inputSchoolId.includes("@");

    // 1. Query user_schoolhead in users_database by school_id column
    let user = null;
    try {
      const shQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM user_schoolhead WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;

      const shRes = await usersDatabasePool.query(shQuery, [
        isEmail ? inputSchoolId.toLowerCase() : inputSchoolId,
      ]);
      if (shRes.rows.length > 0) user = shRes.rows[0];
    } catch (e) {
      console.warn("[user_schoolhead passcode query warning]:", e.message);
    }

    // 2. Secondary fallback: users table in insightEd
    if (!user) {
      const uQuery = isEmail
        ? `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE LOWER(email) = $1 AND (disabled = false OR disabled IS NULL)`
        : `SELECT uid, email, role, region, division, office, account_category, passcode, password_hash, hash_version, first_name, last_name, school_id 
           FROM users WHERE school_id = $1 AND (disabled = false OR disabled IS NULL)`;

      const uRes = await insightEdPool
        .query(uQuery, [isEmail ? inputSchoolId.toLowerCase() : inputSchoolId])
        .catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) user = uRes.rows[0];
    }

    if (!user) {
      const enhancedError = await getUnregisteredSchoolError(
        inputSchoolId,
        isEmail,
      );
      return res.status(401).json({ error: enhancedError });
    }

    if (!user.passcode) {
      return res.status(401).json({
        error:
          "No passcode configured for this account. Please sign in with your password.",
      });
    }

    // Match inputPasscode against passcode column directly
    let isPasscodeValid = false;
    const isBcrypt =
      user.passcode.startsWith("$2b$") || user.passcode.startsWith("$2a$");
    if (isBcrypt) {
      try {
        isPasscodeValid = await bcrypt.compare(inputPasscode, user.passcode);
      } catch (e) {}
    } else {
      isPasscodeValid = inputPasscode === String(user.passcode).trim();
    }

    if (!isPasscodeValid) {
      return res.status(401).json({ error: "Incorrect passcode." });
    }

    const token = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        role: user.role,
        school_id: user.school_id,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
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
        school_id: user.school_id,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Validation Schemas ────────────────────────────────────────────────────────
const passwordLoginSchema = {
  body: z
    .object({
      identifier: z.string().optional(),
      school_id: z.string().optional(),
      password: z.string().min(1, "Password is required"),
    })
    .refine((data) => data.identifier || data.school_id, {
      message: "School ID or identifier is required",
      path: ["school_id"],
    }),
};

const passcodeLoginSchema = {
  body: z
    .object({
      school_id: z.string().optional(),
      identifier: z.string().optional(),
      email: z.string().optional(),
      passcode: z.union([z.string(), z.number()]).optional(),
      pin: z.union([z.string(), z.number()]).optional(),
    })
    .refine((data) => data.school_id || data.identifier || data.email, {
      message: "School ID, identifier, or email is required",
      path: ["school_id"],
    })
    .refine((data) => data.passcode !== undefined || data.pin !== undefined, {
      message: "Passcode or PIN is required",
      path: ["passcode"],
    }),
};

const verifyPasscodeSchema = {
  body: z
    .object({
      passcode: z.union([z.string(), z.number()]).optional(),
      pin: z.union([z.string(), z.number()]).optional(),
    })
    .refine((data) => data.passcode !== undefined || data.pin !== undefined, {
      message: "Passcode is required",
      path: ["passcode"],
    }),
};

// Route mappings with Rate Limiting (RATE-02) and Request Validation
router.post(
  "/migrate-login",
  authLimiter,
  validateRequest(passwordLoginSchema),
  handlePasswordLogin,
);
router.post(
  "/master-login",
  authLimiter,
  validateRequest(passwordLoginSchema),
  handlePasswordLogin,
);
router.post(
  "/password-login",
  authLimiter,
  validateRequest(passwordLoginSchema),
  handlePasswordLogin,
);

router.post(
  "/passcode-login",
  passcodeLimiter,
  validateRequest(passcodeLoginSchema),
  handlePasscodeLogin,
);
router.post(
  "/pin-login",
  passcodeLimiter,
  validateRequest(passcodeLoginSchema),
  handlePasscodeLogin,
);

// POST /api/auth/verify-passcode
router.post(
  "/verify-passcode",
  passcodeLimiter,
  validateRequest(verifyPasscodeSchema),
  (req, res) => {
    res.json({ success: true });
  },
);

module.exports = router;
