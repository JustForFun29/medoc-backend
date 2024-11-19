const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const File = require("../models/File"); // Импорт модели файлов
const authMiddleware = require("../middleware/authMiddleware"); // Импорт middleware

const router = express.Router();

// Указываем директорию для хранения файлов
const UPLOAD_DIR = path.join(__dirname, "../uploads");

// Создаём директорию, если её нет
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Настройка Multer для временного хранения
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: async (req, file, cb) => {
    const { filename } = req.body;

    if (!filename) {
      return cb(new Error("Отсутствует имя файла"));
    }

    // Проверяем наличие файла с таким именем
    const fileExists = fs.existsSync(
      path.join(UPLOAD_DIR, `${filename}${path.extname(file.originalname)}`)
    );
    if (fileExists) {
      return cb(new Error("Файл с таким именем уже существует"));
    }

    // Добавляем расширение оригинального файла
    const fileExtension = path.extname(file.originalname);
    cb(null, `${filename}${fileExtension}`);
  },
});

const upload = multer({ storage });

// 1. Загрузка файла
router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      const { filename, isPublic } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }

      // Сохраняем файл в базе данных
      const newFile = new File({
        fileName: req.file.filename,
        filePath: `/uploads/${req.file.filename}`,
        createdBy: req.user.id, // Используем req.user, установленный middleware
        isPublic: isPublic || false,
      });

      await newFile.save();

      res
        .status(201)
        .json({ message: "File uploaded successfully", file: newFile });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error uploading file", error: error.message });
    }
  }
);

// 2. Отображение файлов
router.get("/", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({
      $or: [{ createdBy: req.user.id }, { isPublic: true }],
    }).select("fileName filePath createdAt isPublic");

    res.status(200).json({ files });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching files", error: error.message });
  }
});

// 3. Удаление файла
router.delete("/files/:fileId", authMiddleware, async (req, res) => {
  const { fileId } = req.params;

  try {
    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({ message: "Файл не найден" });
    }

    // Проверяем права на удаление
    if (!file.createdBy.equals(req.user._id)) {
      return res
        .status(403)
        .json({ message: "У вас нет прав на удаление этого файла" });
    }

    // Удаляем файл с диска
    const filePath = path.join(__dirname, "..", file.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Удаляем запись из базы данных
    await file.remove();

    res.status(200).json({ message: "Файл успешно удалён" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка при удалении файла", error: error.message });
  }
});

module.exports = router;
