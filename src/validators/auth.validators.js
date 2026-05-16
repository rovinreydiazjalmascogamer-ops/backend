// auth validators.js
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s()-]{7,20}$/;
const FULL_NAME_REGEX = /^[A-Za-z]+(?:[ '\-\.][A-Za-z]+)+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

const validateSignup = (req, res, next) => {
    const { user_name, identifier, password } = req.body;

    if (!user_name || !identifier || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const trimmedName = String(user_name).trim();
    if (typeof user_name !== 'string' || trimmedName.length < 2 || trimmedName.length > 50) {
        return res.status(400).json({ message: 'Full name must be between 2 and 50 characters' });
    }

    const nameParts = trimmedName.split(/\s+/).filter(Boolean);
    if (nameParts.length < 2) {
        return res.status(400).json({ message: 'Please enter your full name (first and last name).' });
    }

    if (!FULL_NAME_REGEX.test(trimmedName)) {
        return res.status(400).json({ message: 'Full name contains invalid characters.' });
    }

    const trimmedIdentifier = String(identifier).trim();
    if (trimmedIdentifier.includes('@')) {
        if (!EMAIL_REGEX.test(trimmedIdentifier)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }
    } else {
        const digitsOnly = trimmedIdentifier.replace(/\D/g, '');
        if (!PHONE_REGEX.test(trimmedIdentifier) || digitsOnly.length < 7 || digitsOnly.length > 15) {
            return res.status(400).json({ message: 'Please provide a valid phone number' });
        }
    }

    if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({
            message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
        });
    }

    next();
};

const validateLogin = (req, res, next) => {
    const { identifier, email, phone, password } = req.body;
    const id = identifier || email || phone;

    if (!id || !password) {
        return res.status(400).json({ message: 'Email/Phone and Password are required' });
    }

    if (typeof password !== 'string' || password.length > 128) {
        return res.status(400).json({ message: 'Invalid password format' });
    }

    next();
};

module.exports = {
    validateSignup,
    validateLogin
};
