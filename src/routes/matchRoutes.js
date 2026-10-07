const express = require("express");

const {
    createMatch,
    getMatchById,
    getPlayerMatches,
    submitMatchResult
} = require("../controllers/matchController");


const {
    authenticate,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticate);

router.get("/player/:playerId", getPlayerMatches);

router.post("/:matchId/result", submitMatchResult);

router.get("/:id", getMatchById);

module.exports = router;