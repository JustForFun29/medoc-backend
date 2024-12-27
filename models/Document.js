// models/Document.js
const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fileUrl: { type: String, required: true },
    documentTitle: { type: String, required: true }, // Новое поле
    dateSigned: { type: Date }, // Новое поле
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", DocumentSchema);
