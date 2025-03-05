// controllers/authController.js

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Импортируем модели
const User = require("../models/User");
const Clinic = require("../models/Clinic");
const Contractor = require("../models/Contractor");

// Вспомогательные функции (см. utils)
const { generateResetToken, generateToken } = require("../utils/jwtUtils");
const transporter = require("../utils/nodemailerTransport");

// [1] Запрос сброса пароля (forgot-password)
exports.forgotPassword = async (req, res) => {
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

    // Формирование ссылки для фронтенда
    const resetLink = `${process.env.FRONTEND_URL}/api/auth/validate-reset-token?email=${email}&token=${resetToken}`;

    // Отправка email
    await transporter.sendMail({
      from: `"Поддержка Докомед" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Докомед: Запрос на смену пароля",
      text: `Здравствуйте, ${user.firstName} ${user.fathersName}!
Мы получили запрос на смену вашего пароля в системе Докомед.
Для смены пароля перейдите по этой ссылке: ${resetLink}
Ссылка будет доступна в течение 24 часов.

С уважением,
Команда Докомед
`,
      html: `<p>Здравствуйте, ${user.firstName} ${user.fathersName}!
Мы получили запрос на смену вашего пароля в системе Докомед.
Для смены пароля перейдите по этой <a href="${resetLink}">ссылке</a>.
Ссылка будет доступна в течение 24 часов.

С уважением,<br>
Команда Докомед</p>`,
    });

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error sending reset email:", error);
    res.status(500).json({ message: "Failed to send reset email" });
  }
};

// [2] Проверка токена для сброса пароля (validate-reset-token)
exports.validateResetToken = async (req, res) => {
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
};

// [3] Сброс пароля (reset-password)
exports.resetPassword = async (req, res) => {
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

    // Обновляем пароль
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
};

// [4] Смена пароля (change-password) — для авторизованного пользователя
exports.changePassword = async (req, res) => {
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

    // Сравнить текущий пароль
    const isMatch = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Записать новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.hashedPassword = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Ошибка при изменении пароля:", error);
    res.status(500).json({ message: "Failed to update password" });
  }
};

// [5] Регистрация пользователя (user)
exports.registerUser = async (req, res) => {
  const { firstName, lastName, fathersName, phoneNumber, email, password } =
    req.body;

  try {
    // Проверяем, что не существует user с тем же номером / email
    const existingUser = await User.findOne({
      $or: [{ phoneNumber }, { email }],
    });
    if (existingUser) {
      return res.status(400).json({
        message: "User with this phone number or email already exists",
      });
    }

    // Хэшируем пароль
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

    // Генерируем токен
    const token = generateToken(
      {
        id: newUser._id,
        type: "user",
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        fathersName: newUser.fathersName,
        phoneNumber: newUser.phoneNumber,
        email: newUser.email,
      },
      "7d"
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// [6] Регистрация клиники
exports.registerClinic = async (req, res) => {
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
      return res
        .status(400)
        .json({ message: "Клиника с такими данными уже существует" });
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

    // (Если нужно создать коллекцию контрагентов — делаем)
    const ContractorModel = Contractor(newClinic._id);
    await ContractorModel.createCollection();

    res.status(201).json({
      message: "Клиника успешно зарегистрирована",
      clinicId: newClinic._id,
    });
  } catch (error) {
    console.error("Ошибка регистрации клиники:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// [7] Логин пользователя
exports.loginUser = async (req, res) => {
  const { phoneNumber, password } = req.body;
  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Собираем payload и генерируем JWT
    const token = generateToken(
      {
        id: user._id,
        type: "user",
        firstName: user.firstName,
        lastName: user.lastName,
        fathersName: user.fathersName,
        phoneNumber: user.phoneNumber,
        email: user.email,
      },
      "7d"
    );
    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// [8] Логин клиники
exports.loginClinic = async (req, res) => {
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

    // Генерируем токен
    const token = generateToken(
      {
        id: clinic._id,
        type: "clinic",
        firstName: clinic.firstName,
        lastName: clinic.lastName,
        fathersName: clinic.fathersName,
        phoneNumber: clinic.phoneNumber,
        email: clinic.email,
        clinicName: clinic.clinicName,
      },
      "7d"
    );
    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// [9] Получить данные текущего пользователя/клиники ( /api/auth/me )
exports.getMe = async (req, res) => {
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
    } else if (type === "clinic") {
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
          email: clinic.email,
        },
      });
    }

    res.status(400).json({ message: "Invalid user type" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// [10] Получить данные текущей клиники
exports.getClinicMe = async (req, res) => {
  try {
    if (req.user.type !== "clinic") {
      return res.status(403).json({ message: "Доступ разрешен только клиникам" });
    }

    const clinic = await Clinic.findById(req.user.id).select(
      "clinicName firstName lastName fathersName phoneNumber login"
    );
    if (!clinic) {
      return res.status(404).json({ message: "Клиника не найдена" });
    }

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
    res.status(500).json({ message: "Ошибка при получении данных", error: error.message });
  }
};

