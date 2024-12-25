const mongoose = require("mongoose");

const phoneValidator = /^7\d{10}$/;
const emailValidator = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ClinicSchema = new mongoose.Schema(
  {
    clinicName: { type: String, required: true },
    firstName: { type: String, required: true },
    fathersName: { type: String, required: true },
    lastName: { type: String, required: true },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return phoneValidator.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid phone number! Format: 7xxxxxxxxxx`,
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return emailValidator.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    login: { type: String, required: true, unique: true },
    hashedPassword: { type: String, required: true },
    otp: { type: String },
    otpExpiry: { type: Date },
  },
  { timestamps: true }
);

ClinicSchema.pre("save", function (next) {
  if (this.phoneNumber.startsWith("+")) {
    this.phoneNumber = this.phoneNumber.slice(1);
  }
  next();
});

module.exports = mongoose.model("Clinic", ClinicSchema);
