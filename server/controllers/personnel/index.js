const express = require("express");
const router = express.Router();

const rosterRouter = require("./roster");
const profileRouter = require("./profile");
const common = require("./common");

// Mount sub-routers in strict order:
// 1. Roster & bulk persistence routes (GET /, POST /bulk, DELETE /:id)
// 2. Profile CRUD & sharing routes (GET /autofill-template, POST /share, GET /:id, POST /, PUT /:id)
router.use(rosterRouter);
router.use(profileRouter);

// Re-export core helpers for testing & backward compatibility
router.resolvePersonnelId = common.resolvePersonnelId;
router.parsePostGraduateDiscipline = common.parsePostGraduateDiscipline;
router.formatPersonnelRecord = common.formatPersonnelRecord;
router.fetchMasterPersonnelFromInsightEd = common.fetchMasterPersonnelFromInsightEd;

module.exports = router;
