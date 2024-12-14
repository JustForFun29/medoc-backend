// models/Document.js
const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  fileUrl: { type: String, required: true }, // URL загруженного файла
  recipient: {
    name: { type: String, required: true }, // Полное ФИО подписанта
    phoneNumber: { type: String, required: true },
  },
  sender: {
    clinicName: { type: String, required: true },
    name: { type: String, required: true }, // Полное ФИО отправителя
    phoneNumber: { type: String, required: true },
  },
  status: {
    type: String,
    enum: ["Отклонён", "Подписан", "Отправлен"],
    default: "Отправлен",
  }, // Статус подписания
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Document", DocumentSchema);
