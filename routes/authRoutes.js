// routes/authRoutes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

// Импортируем контроллеры
const {
  forgotPassword,
  validateResetToken,
  resetPassword,
  changePassword,
  registerUser,
  registerClinic,
  loginUser,
  loginClinic,
  getMe,
  getClinicMe,
} = require("../controllers/authController");

// [1] Запрос сброса пароля (не авторизован)
router.post("/forgot-password", forgotPassword);

// [2] Проверка токена сброса
router.get("/validate-reset-token", validateResetToken);

// [3] Сброс пароля
router.post("/reset-password", resetPassword);

// [4] Изменение пароля (авторизован)
router.post("/change-password", authMiddleware, changePassword);

// [5] Регистрация пользователя
router.post("/register/user", registerUser);

// [6] Регистрация клиники
router.post("/register/clinic", registerClinic);

// [7] Логин пользователя
router.post("/login/user", loginUser);

// [8] Логин клиники
router.post("/login/clinic", loginClinic);

// [9] Получить данные текущего пользователя /api/auth/me
router.get("/me", authMiddleware, getMe);

// [10] Получить данные текущей клиники
router.get("/clinic/me", authMiddleware, getClinicMe);

module.exports = router;
