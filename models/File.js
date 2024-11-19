const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isPublic: { type: Boolean, default: false }, // Указывает, доступен ли файл всем
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", FileSchema);
