const validateAndNormalizeGender = (gender, isRequired = false) => {
    if (!gender) {
        if (isRequired) {
            return {
                valid: false,
                message: "Gender is required"
            };
        }
        return {
            valid: true,
            value: null
        };
    }

    const normalized = String(gender).trim().toUpperCase();
    if (!["MALE", "FEMALE", "OTHER"].includes(normalized)) {
        return {
            valid: false,
            message: "Invalid gender. Allowed values: MALE, FEMALE, OTHER"
        };
    }

    return {
        valid: true,
        value: normalized
    };
};

module.exports = {
    validateAndNormalizeGender
};
