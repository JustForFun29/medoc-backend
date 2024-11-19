const express = require("express");
const {
  initiateLogin,
  register,
  verifyOTP,
  verifyPassword,
  verifyRegistrationOTP,
} = require("../controllers/authController");
const { generateLongLivedToken } = require("../utils/tokenGenerator"); // Импорт утилиты генерации токена
const router = express.Router();

// Первый этап: Инициализация логина с отправкой OTP
router.post("/login/initiate", initiateLogin);

// Генерация токена для определённого пользователя
router.get("/get-token", (req, res) => {
  try {
    const userId = "672cee1f6a8825fd3a088a2a"; // ID пользователя
    const token = generateLongLivedToken(userId); // Генерация токена

    res.status(200).json({
      message: "Token generated successfully",
      token,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error generating token",
      error: error.message,
    });
  }
});

// Второй этап: Проверка OTP-кода
router.post("/login/verify-otp", verifyOTP);

// Третий этап: Проверка пароля
router.post("/login/verify-password", verifyPassword);

// Первый этап регистрации: отправка OTP на номер телефона
router.post("/register", register);

// Второй этап регистрации: подтверждение OTP-кода
router.post("/register/verify-otp", verifyRegistrationOTP);

module.exports = router;
