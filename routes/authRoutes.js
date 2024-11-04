// routes/authRoutes.js
const express = require("express");
const {
  initiateLogin,
  register,
  verifyOTP,
  verifyPassword,
  verifyRegistrationOTP,
} = require("../controllers/authController");
const router = express.Router();

// Первый этап: Инициализация логина с отправкой OTP
router.post("/login/initiate", initiateLogin);

// Второй этап: Проверка OTP-кода
router.post("/login/verify-otp", verifyOTP);

// Третий этап: Проверка пароля
router.post("/login/verify-password", verifyPassword);

// Первый этап регистрации: отправка OTP на номер телефона
router.post("/register", register);

// Второй этап регистрации: подтверждение OTP-кода
router.post("/register/verify-otp", verifyRegistrationOTP);

module.exports = router;
