// utils/otpUtils.js
const axios = require("axios");

// Генерация случайного 6-значного OTP кода
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Отправка OTP-кода с использованием SMS API (например, Yandex Cloud SMS)
const sendOTP = async (phoneNumber, otp) => {
  try {
    await axios.post(
      "https://sms.api.cloud.yandex.net/v1/messages",
      {
        phone: phoneNumber,
        text: `Your OTP code is: ${otp}`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.YANDEX_SMS_API_KEY}`,
        },
      }
    );
  } catch (error) {
    console.error("Error sending OTP:", error);
    throw new Error("Failed to send OTP");
  }
};

module.exports = { generateOTP, sendOTP };
