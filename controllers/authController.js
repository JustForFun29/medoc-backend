// controllers/authController.js
const User = require("../models/User");
const axios = require("axios");
const { hashPassword, verifyPassword } = require("../utils/passwordUtils");
const { generateToken } = require("../utils/tokenUtils");
const { generateOTP, sendOTP } = require("../utils/otpUtils");

let registrationOtpAttempts = {}; // Для попыток OTP при регистрации
let otpAttempts = {}; // Для попыток OTP при логине
let passwordAttempts = {}; // Для попыток ввода пароля при логине

// Регистрация: первый этап - отправка OTP на номер телефона
exports.register = async (req, res) => {
  const { email, password, firstName, lastName, fathersName, phoneNumber } =
    req.body;

  try {
    // Проверка на существование пользователя с таким email или номером телефона
    let existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }],
    });
    if (existingUser) {
      return res.status(400).json({
        message: "User with this email or phone number already exists",
      });
    }

    // Генерация и отправка OTP
    const otp = generateOTP();
    await sendOTP(phoneNumber, otp);

    // Хэшируем пароль перед сохранением
    const hashedPassword = await hashPassword(password);

    // Сохраняем OTP и его срок действия во временного пользователя
    const user = new User({
      email,
      hashedPassword,
      firstName,
      lastName,
      fathersName,
      phoneNumber,
      otp,
      otpExpiry: Date.now() + 5 * 60 * 1000, // OTP действует 5 минут
    });

    await user.save();

    res.json({ message: "OTP code sent to phone number for verification" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Регистрация: второй этап - подтверждение OTP
exports.verifyRegistrationOTP = async (req, res) => {
  const { phoneNumber, otp, captchaToken } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(400)
        .json({ message: "User with this phone number not found" });
    }

    // Отслеживаем количество попыток ввода OTP
    registrationOtpAttempts[phoneNumber] =
      (registrationOtpAttempts[phoneNumber] || 0) + 1;

    // Если попыток больше 3, проверяем капчу
    if (registrationOtpAttempts[phoneNumber] > 3) {
      const captchaResponse = await axios.post(
        "https://captcha.api.cloud.yandex.net/v1/captcha/verify",
        {
          secret: process.env.YANDEX_CAPTCHA_SECRET,
          response: captchaToken,
        }
      );

      if (!captchaResponse.data.success) {
        return res.status(403).json({ message: "Captcha verification failed" });
      }
    }

    // Проверка срока действия OTP
    if (Date.now() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP code has expired" });
    }

    // Проверка правильности OTP-кода
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

    // Сброс количества попыток
    registrationOtpAttempts[phoneNumber] = 0;

    // Убираем OTP и срок действия после успешной проверки
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    res.json({ message: "Registration successful, profile created" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Первый этап: Ввод номера телефона и отправка OTP-кода
exports.initiateLogin = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(400)
        .json({ message: "User with this phone number not found" });
    }

    // Генерируем OTP-код и отправляем его
    const otp = generateOTP();
    await sendOTP(phoneNumber, otp);

    // Сохраняем OTP и его срок действия в базе данных
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000; // Код действует 5 минут
    await user.save();

    res.json({ message: "OTP code sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Второй этап: Проверка OTP-кода
exports.verifyOTP = async (req, res) => {
  const { phoneNumber, otp, captchaToken } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(400)
        .json({ message: "User with this phone number not found" });
    }

    // Проверка количества попыток
    otpAttempts[phoneNumber] = (otpAttempts[phoneNumber] || 0) + 1;

    // Если попыток больше 3, проверяем капчу
    if (otpAttempts[phoneNumber] > 3) {
      const captchaResponse = await axios.post(
        "https://captcha.api.cloud.yandex.net/v1/captcha/verify",
        {
          secret: process.env.YANDEX_CAPTCHA_SECRET,
          response: captchaToken,
        }
      );

      if (!captchaResponse.data.success) {
        return res.status(403).json({ message: "Captcha verification failed" });
      }
    }

    // Проверка срока действия OTP
    if (Date.now() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP code has expired" });
    }

    // Проверка OTP-кода
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

    // Сброс счетчика попыток OTP после успешной проверки
    otpAttempts[phoneNumber] = 0;

    // Очистка OTP после успешной проверки
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Переход к следующему этапу (проверка пароля)
    res.json({
      message: "OTP verified successfully, please enter your password",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Третий этап: Проверка пароля
exports.verifyPassword = async (req, res) => {
  const { phoneNumber, password, captchaToken } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(400)
        .json({ message: "User with this phone number not found" });
    }

    // Увеличение количества попыток ввода пароля
    passwordAttempts[phoneNumber] = (passwordAttempts[phoneNumber] || 0) + 1;

    // Если количество попыток больше 3, проверяем капчу
    if (passwordAttempts[phoneNumber] > 3) {
      const captchaResponse = await axios.post(
        "https://captcha.api.cloud.yandex.net/v1/captcha/verify",
        {
          secret: process.env.YANDEX_CAPTCHA_SECRET,
          response: captchaToken,
        }
      );

      if (!captchaResponse.data.success) {
        return res.status(403).json({ message: "Captcha verification failed" });
      }
    }

    // Проверка пароля
    const isMatch = await verifyPassword(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // Сброс счетчика попыток пароля
    passwordAttempts[phoneNumber] = 0;

    // Генерация токена для доступа к личному кабинету
    const token = generateToken(user);
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
