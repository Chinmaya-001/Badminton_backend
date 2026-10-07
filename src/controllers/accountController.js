const pool = require("../config/database");

const {
    hashPassword,
    comparePassword
} = require("../utils/password");


// --------------------------------------------------
// Get table based on JWT role
// --------------------------------------------------

const getAccountInfo = (role) => {

    const accounts = {
        ADMIN: {
            table: "admins",
            role: "ADMIN"
        },

        REFEREE: {
            table: "referees",
            role: "REFEREE"
        },

        PLAYER: {
            table: "players",
            role: "PLAYER"
        }
    };

    return accounts[role];
};


// --------------------------------------------------
// UPDATE PROFILE
// --------------------------------------------------

const {
    validateAndNormalizeGender
} = require("../utils/gender");

const {
    uploadPlayerPhoto,
    getPhotoSignedUrl,
    deletePlayerPhoto
} = require("../config/supabase");

const updateProfile = async (req, res) => {
    try {

        const userId = req.user.id;
        const role = req.user.role;

        const account = getAccountInfo(role);

        if (!account) {
            return res.status(403).json({
                success: false,
                message: "Invalid account role"
            });
        }

        const {
            name,
            email,
            phone,
            gender
        } = req.body;

        const hasPhoto = !!req.file;

        if (!name && !email && !phone && !gender && !hasPhoto) {
            return res.status(400).json({
                success: false,
                message: "At least one field is required to update profile"
            });
        }

        let normalizedGender = null;
        if (gender !== undefined) {
            if (role === "PLAYER") {
                const genderCheck = validateAndNormalizeGender(gender, false);
                if (!genderCheck.valid) {
                    return res.status(400).json({
                        success: false,
                        message: genderCheck.message
                    });
                }
                normalizedGender = genderCheck.value;
            }
        }

        // --------------------------------------------
        // Check email
        // --------------------------------------------

        if (email) {

            const emailResult = await pool.query(
                `SELECT id
                 FROM ${account.table}
                 WHERE LOWER(email) = LOWER($1)
                 AND id <> $2`,
                [email.trim(), userId]
            );

            if (emailResult.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Email is already in use"
                });
            }
        }


        // --------------------------------------------
        // Check phone
        // --------------------------------------------

        if (phone) {

            const phoneResult = await pool.query(
                `SELECT id
                 FROM ${account.table}
                 WHERE phone = $1
                 AND id <> $2`,
                [phone.trim(), userId]
            );

            if (phoneResult.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Phone number is already in use"
                });
            }
        }

        // --------------------------------------------
        // Handle Photo Upload if present
        // --------------------------------------------
        let newPhotoPath = null;
        let oldPhotoPath = null;

        if (hasPhoto && role === "PLAYER") {
            const playerQuery = await pool.query(
                `SELECT photo_url FROM players WHERE id = $1`,
                [userId]
            );
            if (playerQuery.rows.length > 0) {
                oldPhotoPath = playerQuery.rows[0].photo_url;
            }

            try {
                newPhotoPath = await uploadPlayerPhoto(
                    userId,
                    req.file.buffer,
                    req.file.mimetype,
                    req.file.originalname
                );
            } catch (uploadErr) {
                console.error("Profile photo upload failed:", uploadErr);
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload new profile photo"
                });
            }
        }

        // --------------------------------------------
        // Build dynamic UPDATE
        // --------------------------------------------

        const fields = [];
        const values = [];

        let parameterIndex = 1;

        if (name !== undefined) {
            fields.push(`name = $${parameterIndex++}`);
            values.push(name.trim());
        }

        if (email !== undefined) {
            fields.push(`email = $${parameterIndex++}`);
            values.push(email.trim());
        }

        if (phone !== undefined) {
            fields.push(`phone = $${parameterIndex++}`);
            values.push(phone.trim());
        }

        if (normalizedGender !== null && role === "PLAYER") {
            fields.push(`gender = $${parameterIndex++}`);
            values.push(normalizedGender);
        }

        if (newPhotoPath !== null && role === "PLAYER") {
            fields.push(`photo_url = $${parameterIndex++}`);
            values.push(newPhotoPath);
        }

        values.push(userId);

        const returningFields = role === "PLAYER"
            ? "id, name, email, phone, gender, photo_url"
            : "id, name, email, phone";

        const result = await pool.query(
            `UPDATE ${account.table}
             SET ${fields.join(", ")}
             WHERE id = $${parameterIndex}
             RETURNING ${returningFields}`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        const updatedAccount = result.rows[0];

        // Delete old photo in background if updated
        if (newPhotoPath && oldPhotoPath && oldPhotoPath !== newPhotoPath) {
            deletePlayerPhoto(oldPhotoPath).catch(err => {
                console.error("Non-critical error deleting old photo:", err);
            });
        }

        let photoUrl = null;
        if (role === "PLAYER") {
            photoUrl = await getPhotoSignedUrl(updatedAccount.photo_url);
        }

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            account: {
                id: updatedAccount.id,
                name: updatedAccount.name,
                email: updatedAccount.email,
                phone: updatedAccount.phone,

                ...(role === "PLAYER" && {
                    gender: updatedAccount.gender || null,
                    photoUrl
                }),

                role
            }
        });

    } catch (error) {

        console.error(
            "Update profile error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to update profile"
        });
    }
};


// --------------------------------------------------
// UPDATE PASSWORD
// --------------------------------------------------

const updatePassword = async (req, res) => {
    try {

        const userId = req.user.id;
        const role = req.user.role;

        const account = getAccountInfo(role);

        if (!account) {
            return res.status(403).json({
                success: false,
                message: "Invalid account role"
            });
        }

        const {
            currentPassword,
            newPassword
        } = req.body;


        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message:
                    "Current password and new password are required"
            });
        }


        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message:
                    "New password must be at least 6 characters"
            });
        }


        // --------------------------------------------
        // Get current password
        // --------------------------------------------

        const result = await pool.query(
            `SELECT
                id,
                password_hash
             FROM ${account.table}
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        const accountData = result.rows[0];


        // --------------------------------------------
        // Verify old password
        // --------------------------------------------

        const passwordMatch =
            await comparePassword(
                currentPassword,
                accountData.password_hash
            );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect"
            });
        }


        // --------------------------------------------
        // Hash new password
        // --------------------------------------------

        const newPasswordHash =
            await hashPassword(newPassword);


        // --------------------------------------------
        // Update password
        // --------------------------------------------

        await pool.query(
            `UPDATE ${account.table}
             SET password_hash = $1
             WHERE id = $2`,
            [
                newPasswordHash,
                userId
            ]
        );


        res.status(200).json({
            success: true,
            message: "Password updated successfully"
        });

    } catch (error) {

        console.error(
            "Update password error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to update password"
        });
    }
};


module.exports = {
    updateProfile,
    updatePassword
};