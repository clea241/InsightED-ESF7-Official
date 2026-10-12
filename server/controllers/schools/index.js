const express = require("express");
const router = express.Router();

const draftsRouter = require("./drafts");
const profileRouter = require("./profile");
const identityRouter = require("./identity");

// Mount sub-routers in strict order:
// 1. Specific draft routes (/draft)
// 2. Profile & curricular offerings routes (/curricular-config, /shifts, /subjects)
// 3. School identity & root / parameterized routes (/, /:schoolId)
router.use(draftsRouter);
router.use(profileRouter);
router.use(identityRouter);

module.exports = router;

// Re-export core handlers for testing & modular consumers
module.exports.handleGetSchool = identityRouter.handleGetSchool;
module.exports.parseCurricularOffering = identityRouter.parseCurricularOffering;
module.exports.handleGetDraft = draftsRouter.handleGetDraft;
module.exports.handleSaveDraft = draftsRouter.handleSaveDraft;
module.exports.persistNormalizedDraft = draftsRouter.persistNormalizedDraft;
module.exports.syncDraftToNodeStatus = draftsRouter.syncDraftToNodeStatus;
module.exports.safeDraftQuery = draftsRouter.safeDraftQuery;
