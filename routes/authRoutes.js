const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Генерация токена
const generateToken = (id, type) => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, { expiresIn: "7d" });
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

    // Генерируем токен
    const token = generateToken(newUser._id, "user");

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

    // Генерируем токен
    const token = generateToken(newClinic._id, "clinic");

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

    const token = generateToken(user._id, "user");
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

    const token = generateToken(clinic._id, "clinic");
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
