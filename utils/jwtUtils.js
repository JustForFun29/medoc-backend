// utils/jwtUtils.js

const jwt = require("jsonwebtoken");

// Генерация токена для сброса пароля
function generateResetToken(id, type) {
    return jwt.sign({ id, type }, process.env.JWT_SECRET, { expiresIn: "24h" });
}

// Генерация основного токена (для логина)
function generateToken(payload, expiresIn = "7d") {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

module.exports = {
    generateResetToken,
    generateToken,
};
