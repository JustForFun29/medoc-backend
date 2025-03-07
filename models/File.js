// models/File.js

const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  documentTitle: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isPublic: { type: Boolean, default: false },
  // Добавляем поля для путей превью
  previewPdfKey: { type: String }, // путь/ключ к PDF-превью (S3)
  previewPngKey: { type: String }, // путь/ключ к PNG-превью (S3)

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", FileSchema);
