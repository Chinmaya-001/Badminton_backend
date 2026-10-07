const pool = require("../config/database");
const jwt = require("jsonwebtoken");

const {
    comparePassword,
    hashPassword
} = require("../utils/password");

const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                password_hash,
                is_active
             FROM admins
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const admin = result.rows[0];

        if (!admin.is_active) {
            return res.status(403).json({
                success: false,
                message: "Admin account is inactive"
            });
        }

        const passwordMatch = await comparePassword(
            password,
            admin.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                id: admin.id,
                role: "ADMIN"
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: "ADMIN"
            }
        });

    } catch (error) {
        console.error("Admin login error:", error);

        res.status(500).json({
            success: false,
            message: "Login failed",
            error: error.message
        });
    }
};

const refereeLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                password_hash,
                is_active
             FROM referees
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const referee = result.rows[0];

        if (!referee.is_active) {
            return res.status(403).json({
                success: false,
                message: "Referee account is inactive"
            });
        }

        if (!referee.password_hash) {
            return res.status(401).json({
                success: false,
                message: "Referee account is not configured for login"
            });
        }

        const passwordMatch = await comparePassword(
            password,
            referee.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                id: referee.id,
                role: "REFEREE"
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            referee: {
                id: referee.id,
                name: referee.name,
                email: referee.email,
                role: "REFEREE"
            }
        });

    } catch (error) {
        console.error("Referee login error:", error);

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
};

const refereeRegister = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            experience
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        // Check existing email
        const existingEmail = await pool.query(
            `SELECT id FROM referees WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (existingEmail.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered"
            });
        }

        // Check existing phone if provided
        if (phone && phone.trim()) {
            const existingPhone = await pool.query(
                `SELECT id FROM referees WHERE phone = $1`,
                [phone.trim()]
            );

            if (existingPhone.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Phone number is already registered"
                });
            }
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        const result = await pool.query(
            `INSERT INTO referees
            (
                name,
                email,
                phone,
                password_hash,
                is_active
            )
            VALUES ($1, $2, $3, $4, TRUE)
            RETURNING
                id,
                name,
                email,
                phone,
                is_active,
                created_at`,
            [
                name.trim(),
                email.trim(),
                phone ? phone.trim() : null,
                passwordHash
            ]
        );

        const referee = result.rows[0];

        res.status(201).json({
            success: true,
            message: "Referee registered successfully",
            referee: {
                id: referee.id,
                name: referee.name,
                email: referee.email,
                phone: referee.phone,
                isActive: referee.is_active,
                createdAt: referee.created_at
            }
        });

    } catch (error) {
        console.error("Referee registration error:", error);

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
};

const {
    validateAndNormalizeGender
} = require("../utils/gender");

const {
    uploadPlayerPhoto,
    getPhotoSignedUrl
} = require("../config/supabase");

const playerRegister = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            gender
        } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, phone and password are required"
            });
        }

        const genderCheck = validateAndNormalizeGender(gender, true);
        if (!genderCheck.valid) {
            return res.status(400).json({
                success: false,
                message: genderCheck.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Player photo is required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        // Check existing email
        const existingEmail = await pool.query(
            `SELECT id
             FROM players
             WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (existingEmail.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        // Check existing phone
        const existingPhone = await pool.query(
            `SELECT id
             FROM players
             WHERE phone = $1`,
            [phone.trim()]
        );

        if (existingPhone.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Phone number already registered"
            });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create player in database
        const insertResult = await pool.query(
            `INSERT INTO players
            (
                name,
                email,
                phone,
                password_hash,
                gender,
                rating,
                wins,
                losses,
                approval_status
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                1000,
                0,
                0,
                'PENDING'
            )
            RETURNING
                id,
                name,
                email,
                phone,
                gender,
                approval_status,
                created_at`,
            [
                name.trim(),
                email.trim(),
                phone.trim(),
                passwordHash,
                genderCheck.value
            ]
        );

        const newPlayer = insertResult.rows[0];

        // Upload photo to Supabase Storage
        let photoPath = null;
        try {
            photoPath = await uploadPlayerPhoto(
                newPlayer.id,
                req.file.buffer,
                req.file.mimetype,
                req.file.originalname
            );
        } catch (uploadErr) {
            console.error("Player photo upload failed, rolling back player creation:", uploadErr);
            await pool.query(`DELETE FROM players WHERE id = $1`, [newPlayer.id]);
            return res.status(500).json({
                success: false,
                message: "Failed to upload player photo. Registration rolled back."
            });
        }

        // Save photo path in DB
        await pool.query(
            `UPDATE players SET photo_url = $1 WHERE id = $2`,
            [photoPath, newPlayer.id]
        );

        // Generate signed URL
        const photoUrl = await getPhotoSignedUrl(photoPath);

        res.status(201).json({
            success: true,
            message: "Registration submitted. Please wait for admin approval.",
            player: {
                id: newPlayer.id,
                name: newPlayer.name,
                email: newPlayer.email,
                phone: newPlayer.phone,
                gender: newPlayer.gender,
                photoUrl,
                approvalStatus: newPlayer.approval_status
            }
        });

    } catch (error) {

        console.error(
            "Player registration error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
};

const playerLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                phone,
                gender,
                photo_url,
                password_hash,
                approval_status,
                is_active
             FROM players
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const player = result.rows[0];

        // Check approval first
        if (player.approval_status === "PENDING") {
            return res.status(403).json({
                success: false,
                message: "Your registration is waiting for admin approval"
            });
        }

        if (player.approval_status === "REJECTED") {
            return res.status(403).json({
                success: false,
                message: "Your registration has been rejected"
            });
        }

        if (player.approval_status !== "APPROVED") {
            return res.status(403).json({
                success: false,
                message: "Your account is not approved"
            });
        }

        if (player.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive"
            });
        }

        if (!player.password_hash) {
            return res.status(401).json({
                success: false,
                message: "Player account is not configured for login"
            });
        }

        const passwordMatch = await comparePassword(
            password,
            player.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                id: player.id,
                role: "PLAYER"
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        const photoUrl = await getPhotoSignedUrl(player.photo_url);

        res.status(200).json({
            success: true,
            message: "Login successful",

            token,

            player: {
                id: player.id,
                name: player.name,
                email: player.email,
                phone: player.phone,
                gender: player.gender || null,
                photoUrl,
                role: "PLAYER",
                approvalStatus: player.approval_status
            }
        });

    } catch (error) {

        console.error(
            "Player login error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
};

module.exports = {
    adminLogin,
    refereeLogin,
    refereeRegister,
    playerRegister,
    playerLogin
};