const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  documentTitle: { type: String, required: true, unique: true }, // Название документа (уникальное)
  fileName: { type: String, required: true }, // Название файла
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", FileSchema);
