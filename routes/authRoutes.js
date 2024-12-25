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

// Регистрация пользователя
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

// Регистрация клиники
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

// Логин для пациентов
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

// Логин для клиник
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

// Маршрут для получения данных текущего пользователя
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

// GET: Получение данных о текущей клинике
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
