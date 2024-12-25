const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const File = require("../models/File"); // Импорт модели файлов
const authMiddleware = require("../middleware/authMiddleware"); // Импорт middleware

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Files
 *     description: Эндпоинты для работы с файлами
 */

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
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла (UUID + текущая метка времени)
    const uniqueName = `${Date.now()}-${randomUUID()}${path.extname(
      file.originalname
    )}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: async (req, file, cb) => {
    try {
      const { documentTitle } = req.body;

      // Проверка наличия названия документа
      if (!documentTitle) {
        return cb(new Error("Название документа отсутствует"));
      }

      // Проверка уникальности названия документа
      const existingFile = await File.findOne({ documentTitle });
      if (existingFile) {
        return cb(new Error("Документ с таким названием уже существует"));
      }

      cb(null, true);
    } catch (err) {
      cb(err);
    }
  },
});

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     tags:
 *       - Files
 *     summary: Загрузка файла
 *     description: Загружает файл в хранилище и сохраняет данные о нём в базе данных.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               documentTitle:
 *                 type: string
 *                 example: "Название документа"
 *               isPublic:
 *                 type: string
 *                 example: "true"
 *     responses:
 *       201:
 *         description: Файл успешно загружен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Файл успешно загружен"
 *                 file:
 *                   type: object
 *       400:
 *         description: Ошибка валидации или файл отсутствует в запросе
 *       500:
 *         description: Ошибка при загрузке файла
 */
router.post(
  "/upload",
  authMiddleware,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { documentTitle, isPublic } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Файл отсутствует в запросе" });
      }

      // Сохраняем файл в базе данных
      const newFile = new File({
        fileName: req.file.filename, // Сгенерированное случайное имя файла
        documentTitle, // Название документа, видимое пользователю
        filePath: `/uploads/${req.file.filename}`, // Путь к файлу
        createdBy: req.user.id, // Используем req.user, установленный middleware
        isPublic: isPublic === "true", // Преобразуем строку в булево значение
      });

      await newFile.save();

      res.status(201).json({
        message: "Файл успешно загружен",
        file: newFile,
      });
    } catch (error) {
      // Удаляем файл, если он был сохранён, но произошла ошибка в логике
      if (req.file) {
        const filePath = path.join(UPLOAD_DIR, req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      res.status(500).json({
        message: "Ошибка при загрузке файла",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/files:
 *   get:
 *     tags:
 *       - Files
 *     summary: Получение списка файлов
 *     description: Возвращает список файлов, доступных пользователю.
 *     responses:
 *       200:
 *         description: Список файлов успешно получен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Ошибка при получении файлов
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({
      $or: [{ createdBy: req.user.id }, { isPublic: true }],
    }).select("documentTitle filePath createdAt isPublic");

    res.status(200).json({ files });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка при получении файлов", error: error.message });
  }
});

/**
 * @swagger
 * /api/files/{fileId}:
 *   delete:
 *     tags:
 *       - Files
 *     summary: Удаление файла
 *     description: Удаляет файл по его ID, если он принадлежит пользователю.
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID файла для удаления
 *     responses:
 *       200:
 *         description: Файл успешно удалён
 *       404:
 *         description: Файл не найден
 *       403:
 *         description: У пользователя нет прав на удаление файла
 *       500:
 *         description: Ошибка при удалении файла
 */
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
    res.status(500).json({
      message: "Ошибка при удалении файла",
      error: error.message,
    });
  }
});

module.exports = router;
