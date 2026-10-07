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