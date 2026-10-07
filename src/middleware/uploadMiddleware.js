const multer = require("multer");

const storage = multer.memoryStorage();

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error("INVALID_FILE_TYPE");
        cb(error, false);
    }
};

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB limit
    },
    fileFilter
});

const handlePhotoUpload = (req, res, next) => {
    const uploadSingle = upload.single("photo");

    uploadSingle(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    success: false,
                    message: "Photo file size must not exceed 5 MB"
                });
            }

            if (err.message === "INVALID_FILE_TYPE") {
                return res.status(400).json({
                    success: false,
                    message: "Invalid image format. Only JPEG, PNG, WebP, and HEIC are allowed"
                });
            }

            return res.status(400).json({
                success: false,
                message: err.message || "Failed to process photo upload"
            });
        }

        next();
    });
};

module.exports = {
    handlePhotoUpload
};
