const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * Генерация JWT токена с данными пользователя или клиники
 * @param {Object} user - Объект пользователя или клиники
 * @param {string} user._id - Идентификатор пользователя или клиники
 * @param {string} user.type - Тип сущности ("user" или "clinic")
 * @param {string} user.firstName - Имя
 * @param {string} user.lastName - Фамилия
 * @param {string} user.fathersName - Отчество
 * @param {string} user.phoneNumber - Номер телефона
 * @param {string} [user.clinicName] - Название клиники (только для клиник)
 * @returns {string} - Сгенерированный JWT токен
 */
const generateToken = (user) => {
  // Формируем полезную нагрузку токена
  const payload = {
    id: user._id,
    type: user.type, // "user" или "clinic"
    firstName: user.firstName,
    lastName: user.lastName,
    fathersName: user.fathersName,
    phoneNumber: user.phoneNumber,
    ...(user.type === "clinic" && { clinicName: user.clinicName }), // Добавляем название клиники только для клиник
  };

  // Генерируем токен с заданным сроком действия (7 дней)
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
};

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Эндпоинты для авторизации и регистрации
 */

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
  const { firstName, lastName, fathersName, phoneNumber, password } = req.body;

  try {
    // Проверяем, существует ли пользователь с таким номером телефона
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this phone number already exists" });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаём нового пользователя
    const newUser = new User({
      firstName,
      lastName,
      fathersName,
      phoneNumber,
      hashedPassword,
    });

    await newUser.save();

    // Генерируем токен, передавая объект пользователя
    const token = generateToken({
      _id: newUser._id,
      type: "user",
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      fathersName: newUser.fathersName,
      phoneNumber: newUser.phoneNumber,
    });

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
    login,
    password,
  } = req.body;

  try {
    // Проверяем, существует ли клиника с таким логином или номером телефона
    const existingClinic = await Clinic.findOne({
      $or: [{ phoneNumber }, { login }],
    });
    if (existingClinic) {
      return res.status(400).json({
        message: "Clinic with this login or phone number already exists",
      });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаём новую клинику
    const newClinic = new Clinic({
      clinicName,
      firstName,
      lastName,
      fathersName,
      phoneNumber,
      login,
      hashedPassword,
    });

    await newClinic.save();

    // Генерируем токен, передавая объект клиники
    const token = generateToken({
      _id: newClinic._id,
      type: "clinic",
      clinicName: newClinic.clinicName,
      firstName: newClinic.firstName,
      lastName: newClinic.lastName,
      fathersName: newClinic.fathersName,
      phoneNumber: newClinic.phoneNumber,
    });

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

    const token = generateToken(user);
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

    const token = generateToken(clinic);
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
 *       400:
 *         description: Неверный тип пользователя
 *       500:
 *         description: Ошибка сервера
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { id, type } = req.user;

    if (type === "user") {
      const user = await User.findById(id).select(
        "firstName lastName fathersName phoneNumber"
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
        },
      });
    }

    if (type === "clinic") {
      const clinic = await Clinic.findById(id).select(
        "clinicName firstName lastName fathersName phoneNumber"
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
