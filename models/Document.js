// models/Document.js
const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    documentTitle: { type: String, required: true },
    dateSigned: { type: Date },

    recipient: {
      name: { type: String, required: true },
      phoneNumber: { type: String, required: true },
    },
    sender: {
      clinicName: { type: String, required: true },
      name: { type: String, required: true },
      phoneNumber: { type: String, required: true },
    },
    status: {
      type: String,
      enum: ["Отправлен", "Отклонен", "Подписан"],
      default: "Отправлен",
    },

    // Поля для отслеживания, где физически лежит файл
    bucket: {
      type: String,
      default: "docuflow-storage", // Начинаем со стандартного бакета
    },
    objectKey: {
      type: String,
      required: true, // Уникальное имя файла или путь к нему
    },

    lastAccessed: {
      type: Date,
      default: Date.now,
    },
    storageClass: {
      type: String,
      enum: ["STANDARD", "COLD", "ICE"],
      default: "STANDARD",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", DocumentSchema);
