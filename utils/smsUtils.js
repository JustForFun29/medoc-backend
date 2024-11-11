// utils/smsUtils.js
const axios = require("axios");

// Отправка SMS через Exolve API от МТС
const sendNotificationSMS = async (phoneNumber, message) => {
  try {
    await axios.post(
      "https://api.exolve.ru/messaging/v1/SendSMS",
      {
        to: phoneNumber,
        text: message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MTS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`SMS sent to ${phoneNumber}`);
  } catch (error) {
    console.error(
      "Failed to send SMS:",
      error.response ? error.response.data : error.message
    );
  }
};

module.exports = { sendNotificationSMS };
