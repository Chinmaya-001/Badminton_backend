require("dotenv").config();

const playerRoutes = require("./routes/playerRoutes");
const matchRoutes = require("./routes/matchRoutes");
const refereeRoutes = require("./routes/refereeRouter");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const rankingRoutes = require("./routes/rankingRoutes");

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const pool = require("./config/database");

// Health check endpoint for Render
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "Badminton API is running" });
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/health/db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() as current_time");
        res.json({
            status: "connected",
            time: result.rows[0].current_time,
            db_host: process.env.DB_HOST ? `${process.env.DB_HOST.slice(0, 10)}...` : (process.env.DATABASE_URL ? "DATABASE_URL set" : "NOT_SET"),
        });
    } catch (err) {
        console.error("DB Health Check Failed:", err);
        res.status(500).json({
            status: "db_error",
            message: err.message,
            code: err.code,
            details: {
                has_DB_HOST: !!process.env.DB_HOST,
                has_DB_USER: !!process.env.DB_USER,
                has_DB_PASSWORD: !!process.env.DB_PASSWORD,
                has_DB_NAME: !!process.env.DB_NAME,
                has_JWT_SECRET: !!process.env.JWT_SECRET,
                has_DATABASE_URL: !!process.env.DATABASE_URL
            }
        });
    }
});


app.use("/api/auth", authRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/referee", refereeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rankings", rankingRoutes);



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;