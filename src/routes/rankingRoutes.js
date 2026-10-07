const express = require("express");

const {
    getLeaderboard,
    getPlayerRanking,
    getPlayerRank
} = require("../controllers/rankingController");

const router = express.Router();

router.get("/", getLeaderboard);
router.get("/player/:playerId/rank", getPlayerRank);
router.get("/player/:playerId", getPlayerRanking);
router.get("/:playerId/rank", getPlayerRank);
router.get("/:playerId", getPlayerRanking);

module.exports = router;