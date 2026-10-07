const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization token is required"
            });
        }

        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format"
            });
        }

        const token = parts[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Admin access required"
        });
    }

    next();
};


const requireReferee = (req, res, next) => {
    if (!req.user || req.user.role !== "REFEREE") {
        return res.status(403).json({
            success: false,
            message: "Referee access required"
        });
    }

    next();
};

const requirePlayer = (req, res, next) => {
    if (!req.user || req.user.role !== "PLAYER") {
        return res.status(403).json({
            success: false,
            message: "Player access required"
        });
    }

    next();
};

module.exports = {
    authenticate,
    requireAdmin,
    requireReferee,
    requirePlayer
};