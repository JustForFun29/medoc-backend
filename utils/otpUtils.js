// utils/otpUtils.js
const axios = require("axios");

// Генерация случайного 6-значного OTP кода
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Отправка OTP-кода с использованием Exolve API от МТС
const sendOTP = async (phoneNumber, otp) => {
  try {
    const message = `Ваш OTP код: ${otp}`;

    // Запрос на отправку SMS через Exolve API
    const response = await axios.post(
      "https://api.exolve.ru/messaging/v1/SendSMS",
      {
        number: "79926607293",
        destination: phoneNumber, // .replace("+", ""), // убираем '+' для номера получателя
        text: message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MTS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200 || response.status === 201) {
      console.log(`OTP sent to ${phoneNumber}`);
      console.log("Full response from server:", response); // выводим полный ответ
      return response.data; // возвращаем полный ответ от сервера
    } else {
      throw new Error(`Failed to send OTP: ${response.statusText}`);
    }
  } catch (error) {
    console.error(
      "Error sending OTP:",
      error.response ? error.response.data : error.message
    );
    throw new Error("Failed to send OTP");
  }
};

module.exports = { generateOTP, sendOTP };
