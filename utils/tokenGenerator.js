const jwt = require("jsonwebtoken");

const generateLongLivedToken = (userId) => {
  const payload = { id: userId };
  const secret = process.env.JWT_SECRET; // Убедитесь, что секретный ключ установлен в .env
  const options = { expiresIn: "365d" }; // Токен будет действителен 365 дней

  return jwt.sign(payload, secret, options);
};

module.exports = { generateLongLivedToken };
