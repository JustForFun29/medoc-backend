// models/User.js
const mongoose = require("mongoose");

// Регулярное выражение для валидации номера телефона
// Например, для номеров в формате +7xxxxxxxxxx
const phoneValidator = /^(\+7)[0-9]{10}$/;

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    fathersName: { type: String, required: true },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return phoneValidator.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid phone number! Format: +7xxxxxxxxxx`,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
