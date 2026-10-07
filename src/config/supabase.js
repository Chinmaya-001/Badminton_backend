const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ;
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "player-photos";

let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn("Supabase credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) not set in environment.");
}

/**
 * Upload a player photo buffer to the private "player-photos" bucket.
 * Storage path: players/{playerId}/profile_{timestamp}.{ext}
 */
const uploadPlayerPhoto = async (playerId, fileBuffer, mimeType, originalName) => {
    if (!supabase) {
        throw new Error("Supabase client is not initialized. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
    }

    const extMap = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic"
    };

    const ext = extMap[mimeType] || (originalName ? originalName.split('.').pop() : 'jpg');
    const filePath = `players/${playerId}/profile_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, fileBuffer, {
            contentType: mimeType,
            upsert: true
        });

    if (error) {
        console.error("Supabase upload error:", error);
        throw error;
    }

    return filePath;
};

/**
 * Generate a server-side signed URL for a private bucket photo path.
 * If photoPath is null/empty or already a full URL, handles accordingly.
 */
const getPhotoSignedUrl = async (photoPath) => {
    if (!photoPath) return null;
    if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
        return photoPath;
    }

    if (!supabase) return null;

    try {
        // Generate signed URL valid for 7 days (604800 seconds)
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(photoPath, 604800);

        if (error || !data) {
            console.error("Error generating signed URL:", error);
            return null;
        }

        return data.signedUrl;
    } catch (err) {
        console.error("Signed URL exception:", err);
        return null;
    }
};

/**
 * Delete a photo from Supabase Storage (e.g. when updating profile photo).
 */
const deletePlayerPhoto = async (photoPath) => {
    if (!photoPath || photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
        return;
    }

    if (!supabase) return;

    try {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([photoPath]);

        if (error) {
            console.error("Failed to delete old photo from Supabase Storage:", error);
        }
    } catch (err) {
        console.error("Exception deleting old photo:", err);
    }
};

module.exports = {
    supabase,
    uploadPlayerPhoto,
    getPhotoSignedUrl,
    deletePlayerPhoto,
    BUCKET_NAME
};
