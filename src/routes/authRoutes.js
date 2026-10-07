const express = require("express");

const {
    adminLogin,
    refereeLogin,
    refereeRegister,
    playerRegister,
    playerLogin
} = require("../controllers/authController");

const {
    handlePhotoUpload
} = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post("/admin/login", adminLogin);
router.post("/referee/login", refereeLogin);
router.post("/referee/register", refereeRegister);

router.post("/player/register", handlePhotoUpload, playerRegister);
router.post("/player/login", playerLogin);

module.exports = router;