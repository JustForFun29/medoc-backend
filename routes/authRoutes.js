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

// [1] Запрос сброса пароля (не авторизован) (POST /api/auth/forgot-password)
router.post("/forgot-password", forgotPassword);

// [2] Проверка токена сброса (GET /api/auth/validate-reset-token)
router.get("/validate-reset-token", validateResetToken);

// [3] Сброс пароля (POST /api/auth/reset-password)
router.post("/reset-password", resetPassword);

// [4] Изменение пароля (авторизован) (POST /api/auth/change-password)
router.post("/change-password", authMiddleware, changePassword);

// [5] Регистрация пользователя (POST /api/auth/register/user)
router.post("/register/user", registerUser);

// [6] Регистрация клиники (POST /api/auth/register/clinic)
router.post("/register/clinic", registerClinic);

// [7] Логин пользователя (POST /api/auth/login/user)
router.post("/login/user", loginUser);

// [8] Логин клиники (POST /api/auth/login/clinic)
router.post("/login/clinic", loginClinic);

// [9] Получить данные текущего пользователя (GET /api/auth/me)
router.get("/me", authMiddleware, getMe);

// [10] Получить данные текущей клиники (GET /api/auth/clinic/me)
router.get("/clinic/me", authMiddleware, getClinicMe);

module.exports = router;
