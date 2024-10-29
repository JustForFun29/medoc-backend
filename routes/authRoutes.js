// routes/authRoutes.js
const express = require("express");
const { register, login } = require("../controllers/authController");
const router = express.Router();

// Регистрация
router.post("/register", register);

// Логин
router.post("/login", login);

module.exports = router;
