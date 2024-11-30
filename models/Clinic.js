const mongoose = require("mongoose");

// Регулярное выражение для валидации номера телефона (начинается с 7 и содержит 11 цифр)
const phoneValidator = /^7\d{10}$/;

const ClinicSchema = new mongoose.Schema(
  {
    // Название клиники
    clinicName: { type: String, required: true },

    // Имя исполнительного директора
    firstName: { type: String, required: true },

    // Отчество исполнительного директора
    fathersName: { type: String, required: true },

    // Фамилия исполнительного директора
    lastName: { type: String, required: true },

    // Номер телефона
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return phoneValidator.test(v); // проверка, что номер соответствует формату "7xxxxxxxxxx"
        },
        message: (props) =>
          `${props.value} is not a valid phone number! Format: 7xxxxxxxxxx`,
      },
    },

    // Логин
    login: { type: String, required: true, unique: true },

    // Хэшированный пароль
    hashedPassword: { type: String, required: true },

    // Поля для OTP (если используется авторизация через OTP)
    otp: { type: String }, // Для хранения OTP
    otpExpiry: { type: Date }, // Время истечения OTP
  },
  { timestamps: true }
);

// Удаление "+" из phoneNumber перед сохранением
ClinicSchema.pre("save", function (next) {
  if (this.phoneNumber.startsWith("+")) {
    this.phoneNumber = this.phoneNumber.slice(1); // удаляем "+" в начале номера
  }
  next();
});

module.exports = mongoose.model("Clinic", ClinicSchema);
