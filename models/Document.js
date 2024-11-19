// models/Document.js
const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  fileUrl: { type: String, required: true }, // URL загруженного файла
  recipient: {
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true },
  },
  sender: {
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true },
  },
  status: { type: String, enum: ["Pending", "Signed"], default: "Pending" }, // Статус подписания
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Document", DocumentSchema);
