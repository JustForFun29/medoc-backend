// controllers/documentController.js
const Document = require("../models/Document");
const { sendNotificationSMS } = require("../utils/smsUtils");

exports.createDocument = async (req, res) => {
  const { title, content, recipientPhoneNumber, recipientName } = req.body;

  try {
    // Создаем новый документ
    const newDocument = new Document({
      title,
      content,
      recipientPhoneNumber,
      recipientName,
    });

    await newDocument.save();

    // Отправка уведомления SMS пользователю
    const message = `Hello ${recipientName}, you have a new document titled "${title}" awaiting your signature.`;
    await sendNotificationSMS(recipientPhoneNumber, message);

    res.status(201).json({ message: "Document created and SMS sent." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
