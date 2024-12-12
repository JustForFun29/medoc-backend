// models/User.js
const mongoose = require("mongoose");

// Регулярное выражение для валидации номера телефона (начинается с 7 и содержит 11 цифр)
const phoneValidator = /^7\d{10}$/;

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    fathersName: { type: String, required: true },
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
    hashedPassword: { type: String, required: true }, // Поле для хешированного пароля
  },
  { timestamps: true }
);

// Удаление "+" из phoneNumber перед сохранением
UserSchema.pre("save", function (next) {
  if (this.phoneNumber.startsWith("+")) {
    this.phoneNumber = this.phoneNumber.slice(1); // удаляем "+" в начале номера
  }
  next();
});

module.exports = mongoose.model("User", UserSchema);
