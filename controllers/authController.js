// controllers/authController.js
const User = require("../models/User");
const { hashPassword, verifyPassword } = require("../utils/passwordUtils");
const { generateToken } = require("../utils/tokenUtils");

// Регистрация нового пользователя
exports.register = async (req, res) => {
  const { email, firstName, lastName, fathersName, phoneNumber } = req.body;

  try {
    // Проверка на существование пользователя с таким же email или номером телефона
    let user = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (user) {
      return res
        .status(400)
        .json({
          message: "User with this email or phone number already exists",
        });
    }

    // Создание нового пользователя
    user = new User({
      email,
      firstName,
      lastName,
      fathersName,
      phoneNumber,
    });

    // Сохранение пользователя в базу данных
    await user.save();

    // Генерация JWT токена
    const token = generateToken(user);
    res.status(201).json({ token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Логин пользователя
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Поиск пользователя по email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Проверка пароля
    const isMatch = await verifyPassword(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Генерация JWT токена
    const token = generateToken(user);
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
