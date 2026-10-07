const express = require("express");

const {
    getLeaderboard,
    getPlayerRanking
} = require("../controllers/rankingController");

const router = express.Router();

router.get("/", getLeaderboard);
router.get("/player/:playerId", getPlayerRanking);
router.get("/:playerId", getPlayerRanking);

module.exports = router;