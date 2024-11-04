// controllers/authController.js
const User = require("../models/User");
const { hashPassword, verifyPassword } = require("../utils/passwordUtils");
const { generateToken } = require("../utils/tokenUtils");
const { generateOTP, sendOTP } = require("../utils/otpUtils");

let registrationOtpAttempts = {};

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
      return res
        .status(400)
        .json({
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
