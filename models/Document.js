// models/Document.js
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      // Можно добавить enum, чтобы события были из ограниченного списка
      enum: ["Подготовлен", "Отправлен", "Подписан", "Отклонён"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false } // Не создаём отдельный _id для каждого события
);

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    documentTitle: { type: String, required: true },

    // Можно убрать dateSigned, если теперь вы храните факт подписания в events
    // dateSigned: { type: Date },

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
      enum: ["Подготовлен", "Отправлен", "Подписан", "Отклонён"],
      default: "Подготовлен",
    },

    // Поля для отслеживания, где физически лежит файл
    bucket: {
      type: String,
      default: "docuflow-storage", // Начинаем со стандартного бакета
    },
    objectKey: {
      type: String,
      required: true,
    },

    // Поле для класса хранения
    storageClass: {
      type: String,
      enum: ["STANDARD", "COLD", "ICE"],
      default: "STANDARD",
    },

    // Когда последний раз документ брали (для разогрева из COLD и т.д.)
    lastAccessed: {
      type: Date,
      default: Date.now,
    },

    // Массив событий (type, timestamp)
    events: [eventSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", DocumentSchema);
