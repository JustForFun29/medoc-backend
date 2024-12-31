const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware");
const nodemailer = require("nodemailer");

const router = express.Router();

// Настройка nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.yandex.ru",
  port: 465,
  secure: true, // Используется SSL
  auth: {
    user: process.env.EMAIL_USER, // Логин от Яндекс.Почты
    pass: process.env.EMAIL_PASS, // Пароль от Яндекс.Почты
  },
});

// Генерация токена для сброса пароля
const generateResetToken = (id, type) =>
  jwt.sign({ id, type }, process.env.JWT_SECRET, { expiresIn: "24h" });

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Эндпоинты для авторизации и регистрации
 */

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Запрос сброса пароля - шаг 1
 *     description: Отправляет письмо с уникальной ссылкой для сброса пароля.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Письмо для сброса пароля успешно отправлено.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password reset email sent"
 *       400:
 *         description: Email отсутствует в запросе.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email is required"
 *       404:
 *         description: Пользователь или клиника не найдены.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User or clinic not found"
 *       500:
 *         description: Ошибка сервера при отправке письма.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to send reset email"
 */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user =
      (await User.findOne({ email })) || (await Clinic.findOne({ email }));

    if (!user) {
      return res.status(404).json({ message: "User or clinic not found" });
    }

    // Генерация токена
    const resetToken = generateResetToken(
      user._id,
      user instanceof User ? "user" : "clinic"
    );

    // Формирование ссылки в стиле Zapier
    const resetLink = `${process.env.FRONTEND_URL}/api/auth/validate-reset-token?email=${email}&token=${resetToken}`;

    // Отправка email
    await transporter.sendMail({
      from: `"Medoc Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Medoc: Запрос на смену пароля",
      text: `Здравствуйте ,${user.firstName} ${user.fathersName}!\nМы получили запрос на смену вашего пароля в системе Medoc.\nДля смены пароля перейдите по этой ссылке: ${resetLink}\nДанная ссылка будет доступна в течении 24 часов.\n\nС уважением,\nкоманда Medoc`,
      html: `<p>Здравствуйте ,${user.firstName} ${user.fathersName}!\nМы получили запрос на смену вашего пароля в системе Medoc.\nДля смены пароля перейдите по этой <a href="${resetLink}">ссылке</a>\nДанная ссылка будет доступна в течении 24 часов.\n\nС уважением,\nкоманда Medoc</p>`,
    });

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error sending reset email:", error);
    res.status(500).json({ message: "Failed to send reset email" });
  }
});

/**
 * @swagger
 * /api/auth/validate-reset-token:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Проверка токена сброса пароля - шаг 2
 *     description: Проверяет валидность токена сброса пароля и его связь с пользователем или клиникой.
 *     parameters:
 *       - name: email
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: "user@example.com"
 *         description: Email, связанный с учетной записью.
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         description: Токен, отправленный в письме для сброса пароля.
 *     responses:
 *       200:
 *         description: Токен действителен.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Token is valid"
 *       400:
 *         description: Токен истек.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Reset token expired"
 *       404:
 *         description: Неверный токен или пользователь не найден.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid token or user not found"
 *       500:
 *         description: Ошибка сервера при проверке токена.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to validate token"
 */
router.get("/validate-reset-token", async (req, res) => {
  const { email, token } = req.query;

  try {
    const { id, type } = jwt.verify(token, process.env.JWT_SECRET);

    // Найти пользователя или клинику
    const user =
      type === "user"
        ? await User.findOne({ email })
        : await Clinic.findOne({ email });

    if (!user || user._id.toString() !== id) {
      return res
        .status(404)
        .json({ message: "Invalid token or user not found" });
    }

    res.status(200).json({ message: "Token is valid" });
  } catch (error) {
    console.error("Error validating token:", error);
    if (error.name === "TokenExpiredError") {
      res.status(400).json({ message: "Reset token expired" });
    } else {
      res.status(500).json({ message: "Failed to validate token" });
    }
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Сброс пароля - шаг 3
 *     description: Сбрасывает пароль пользователя или клиники с использованием токена, email и нового пароля.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               newPassword:
 *                 type: string
 *                 example: "NewSecurePassword123"
 *     responses:
 *       200:
 *         description: Пароль успешно сброшен.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password reset successfully"
 *       400:
 *         description: Токен истек.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Reset token expired"
 *       404:
 *         description: Неверный токен или пользователь не найден.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid token or user not found"
 *       500:
 *         description: Ошибка сервера при сбросе пароля.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to reset password"
 */
router.post("/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;

  try {
    const { id, type } = jwt.verify(token, process.env.JWT_SECRET);

    // Найти пользователя или клинику
    const user =
      type === "user"
        ? await User.findOne({ email })
        : await Clinic.findOne({ email });

    if (!user || user._id.toString() !== id) {
      return res
        .status(404)
        .json({ message: "Invalid token or user not found" });
    }

    // Обновление пароля
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.hashedPassword = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    if (error.name === "TokenExpiredError") {
      res.status(400).json({ message: "Reset token expired" });
    } else {
      res.status(500).json({ message: "Failed to reset password" });
    }
  }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Изменение пароля для авторизованного пользователя
 *     description: Позволяет авторизованному пользователю изменить свой текущий пароль.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "OldPassword123"
 *               newPassword:
 *                 type: string
 *                 example: "NewSecurePassword123"
 *     responses:
 *       200:
 *         description: Пароль успешно изменён.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password updated successfully"
 *       400:
 *         description: Неверный текущий пароль.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Current password is incorrect"
 *       500:
 *         description: Ошибка сервера.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to update password"
 */
router.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both fields are required" });
    }

    const { id, type } = req.user;

    const user =
      type === "user"
        ? await User.findById(id)
        : type === "clinic"
        ? await Clinic.findById(id)
        : null;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.hashedPassword = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Ошибка при изменении пароля:", error);
    res.status(500).json({ message: "Failed to update password" });
  }
});

//  Генерация JWT токена с данными пользователя или клиники
const generateToken = (user, type) => {
  const payload = {
    id: user._id,
    type: type,
    firstName: user.firstName,
    lastName: user.lastName,
    fathersName: user.fathersName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    ...(user.type === "clinic" && { clinicName: user.clinicName }),
  };

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
};

/**
 * @swagger
 * /api/auth/register/user:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Регистрация нового пользователя
 *     description: Создает нового пользователя и возвращает JWT токен.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "Иван"
 *               lastName:
 *                 type: string
 *                 example: "Петров"
 *               fathersName:
 *                 type: string
 *                 example: "Александрович"
 *               phoneNumber:
 *                 type: string
 *                 example: "71234567890"
 *               email:
 *                 type: string
 *                 example: "test@gmail.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       201:
 *         description: Пользователь успешно зарегистрирован
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered successfully"
 *                 token:
 *                   type: string
 *       400:
 *         description: Пользователь с таким номером телефона уже существует
 *       500:
 *         description: Ошибка сервера
 */
router.post("/register/user", async (req, res) => {
  const { firstName, lastName, fathersName, phoneNumber, email, password } =
    req.body;

  try {
    const existingUser = await User.findOne({
      $or: [{ phoneNumber }, { email }],
    });
    if (existingUser) {
      return res.status(400).json({
        message: "User with this phone number or email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      fathersName,
      phoneNumber,
      email,
      hashedPassword,
    });

    await newUser.save();

    const token = generateToken(newUser, "user");

    res.status(201).json({
      message: "User registered successfully",
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/register/clinic:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Регистрация новой клиники
 *     description: Создает новую клинику и возвращает JWT токен.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clinicName:
 *                 type: string
 *                 example: "Клиника Здоровье"
 *               firstName:
 *                 type: string
 *                 example: "Анна"
 *               lastName:
 *                 type: string
 *                 example: "Иванова"
 *               fathersName:
 *                 type: string
 *                 example: "Сергеевна"
 *               phoneNumber:
 *                 type: string
 *                 example: "79998887766"
 *               email:
 *                 type: string
 *                 example: "test@gmail.com"
 *               login:
 *                 type: string
 *                 example: "clinic_login"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       201:
 *         description: Клиника успешно зарегистрирована
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Clinic registered successfully"
 *                 token:
 *                   type: string
 *       400:
 *         description: Клиника с таким логином или номером телефона уже существует
 *       500:
 *         description: Ошибка сервера
 */
router.post("/register/clinic", async (req, res) => {
  const {
    clinicName,
    firstName,
    lastName,
    fathersName,
    phoneNumber,
    email,
    login,
    password,
  } = req.body;

  try {
    const existingClinic = await Clinic.findOne({
      $or: [{ phoneNumber }, { email }, { login }],
    });
    if (existingClinic) {
      return res.status(400).json({
        message:
          "Clinic with this phone number, email, or login already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newClinic = new Clinic({
      clinicName,
      firstName,
      lastName,
      fathersName,
      phoneNumber,
      email,
      login,
      hashedPassword,
    });

    await newClinic.save();

    const token = generateToken(newClinic, "clinic");

    res.status(201).json({
      message: "Clinic registered successfully",
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/login/user:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Авторизация пользователя
 *     description: Логин пользователя с использованием номера телефона и пароля
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "71234567890"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Успешная авторизация
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *       401:
 *         description: Неверные учетные данные
 *       500:
 *         description: Ошибка сервера
 */
router.post("/login/user", async (req, res) => {
  const { phoneNumber, password } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Добавляем type "user" к объекту перед генерацией токена
    user.type = "user";

    const token = generateToken(user, "user");
    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/login/clinic:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Авторизация клиники
 *     description: Выполняет логин клиники с использованием логина и пароля.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               login:
 *                 type: string
 *                 example: "clinic_login"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Успешная авторизация
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *       401:
 *         description: Неверные учетные данные
 *       500:
 *         description: Ошибка сервера
 */
router.post("/login/clinic", async (req, res) => {
  const { login, password } = req.body;

  try {
    const clinic = await Clinic.findOne({ login });
    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    const isMatch = await bcrypt.compare(password, clinic.hashedPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Добавляем type "clinic" к объекту перед генерацией токена
    clinic.type = "clinic";

    const token = generateToken(clinic, "clinic");
    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Получение данных текущего пользователя
 *     description: Возвращает данные о текущем пользователе или клинике на основе JWT токена.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Успешное получение данных
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: "user"
 *                 data:
 *                   type: object
 *                   properties:
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     fathersName:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     email:
 *                       type: string
 *       401:
 *         description: Токен отсутствует или недействителен
 *       500:
 *         description: Ошибка сервера
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { id, type } = req.user;

    if (type === "user") {
      const user = await User.findById(id).select(
        "firstName lastName fathersName phoneNumber email"
      );
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.status(200).json({
        type: "user",
        data: {
          firstName: user.firstName,
          lastName: user.lastName,
          fathersName: user.fathersName,
          phoneNumber: user.phoneNumber,
          email: user.email,
        },
      });
    }

    if (type === "clinic") {
      const clinic = await Clinic.findById(id).select(
        "clinicName firstName lastName fathersName phoneNumber email"
      );
      if (!clinic) {
        return res.status(404).json({ message: "Clinic not found" });
      }
      return res.status(200).json({
        type: "clinic",
        data: {
          clinicName: clinic.clinicName,
          firstName: clinic.firstName,
          lastName: clinic.lastName,
          fathersName: clinic.fathersName,
          phoneNumber: clinic.phoneNumber,
          email: clinic.email, // Возвращаем email
        },
      });
    }

    res.status(400).json({ message: "Invalid user type" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/clinic/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Получение данных текущей клиники
 *     security:
 *       - bearerAuth: []
 *     description: Возвращает данные о текущей клинике на основе JWT токена.
 *     responses:
 *       200:
 *         description: Успешное получение данных
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clinicName:
 *                   type: string
 *                   example: "Клиника Здоровье"
 *                 responsible:
 *                   type: object
 *                   properties:
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     fathersName:
 *                       type: string
 *                 phoneNumber:
 *                   type: string
 *                   example: "79998887766"
 *                 login:
 *                   type: string
 *                   example: "clinic_login"
 *       403:
 *         description: Доступ запрещен для пользователей
 *       500:
 *         description: Ошибка сервера
 */
router.get("/clinic/me", authMiddleware, async (req, res) => {
  try {
    // Проверяем, что это запрос от клиники
    if (req.user.type !== "clinic") {
      return res
        .status(403)
        .json({ message: "Доступ разрешен только клиникам" });
    }

    // Находим данные клиники по ID из токена
    const clinic = await Clinic.findById(req.user.id).select(
      "clinicName firstName lastName fathersName phoneNumber login"
    );

    if (!clinic) {
      return res.status(404).json({ message: "Клиника не найдена" });
    }

    // Возвращаем данные о клинике
    res.status(200).json({
      clinicName: clinic.clinicName,
      responsible: {
        firstName: clinic.firstName,
        lastName: clinic.lastName,
        fathersName: clinic.fathersName,
      },
      phoneNumber: clinic.phoneNumber,
      login: clinic.login,
    });
  } catch (error) {
    console.error("Ошибка при получении данных клиники:", error);
    res
      .status(500)
      .json({ message: "Ошибка при получении данных", error: error.message });
  }
});

module.exports = router;
