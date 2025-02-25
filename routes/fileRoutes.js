const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const File = require("../models/File"); // Импорт модели файлов
const authMiddleware = require("../middleware/authMiddleware");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const router = express.Router();


// Настройка S3 клиента
const s3Client = new S3Client({
  region: "ru-central-1",
  endpoint: "https://s3.cloud.ru",
  credentials: {
    accessKeyId: process.env.CLOUD_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = "docuflow-storage";
const FOLDER_NAME = "files/";

// Настройка Multer для обработки файлов в памяти
const upload = multer({ storage: multer.memoryStorage() });

// Получение документов для текущей авторизованной клиники
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Получаем файлы, созданные пользователем или публичные файлы
    const files = await File.find({
      $or: [{ createdBy: req.user.id }, { isPublic: true }],
    }).select("fileName documentTitle createdBy isPublic createdAt");

    res.status(200).json({ files });
  } catch (error) {
    console.error("Ошибка при получении файлов:", error);
    res.status(500).json({ message: "Ошибка при получении файлов" });
  }
});

// Сохранение файла в системе (шаблонного файла)
router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      const { isPublic, documentTitle } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Файл отсутствует в запросе" });
      }

      const uniqueFileName = `${Date.now()}-${randomUUID()}`;
      const s3Key = `${FOLDER_NAME}${uniqueFileName}`;

      // Загружаем файл в S3
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };

      try {
        await s3Client.send(new PutObjectCommand(uploadParams));
      } catch (s3Error) {
        console.error("Ошибка загрузки в S3:", s3Error);
        return res
          .status(500)
          .json({ message: "Ошибка при загрузке файла в хранилище" });
      }

      // Сохраняем файл в базе данных
      const newFile = new File({
        fileName: uniqueFileName,
        documentTitle: documentTitle,
        createdBy: req.user.id,
        isPublic: isPublic === "true",
      });

      try {
        await newFile.save();
      } catch (dbError) {
        // Если произошла ошибка сохранения в базе данных, удаляем файл из S3
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
        );
        console.error("Ошибка сохранения в базе данных:", dbError);
        return res
          .status(500)
          .json({ message: "Ошибка при сохранении данных файла" });
      }

      res.status(201).json({
        message: "Файл успешно загружен",
        file: newFile,
      });
    } catch (error) {
      console.error("Ошибка при загрузке файла:", error);
      res.status(500).json({ message: "Ошибка при загрузке файла" });
    }
  }
);

// Удаление файла из системы (только если его создал сам пользователь)
router.delete("/:fileName", authMiddleware, async (req, res) => {
  const { fileName } = req.params;

  try {
    const file = await File.findOne({ fileName });

    if (!file) {
      return res.status(404).json({ message: "Файл не найден" });
    }

    if (!file.createdBy.equals(req.user.id)) {
      return res
        .status(403)
        .json({ message: "У вас нет прав на удаление этого файла" });
    }

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: `files/${file.fileName}`, // Убедитесь, что путь соответствует вашему бакету
    };

    try {
      await s3Client.send(new DeleteObjectCommand(deleteParams));
    } catch (s3Error) {
      console.error("Ошибка удаления из S3:", s3Error);
      return res
        .status(500)
        .json({ message: "Ошибка при удалении файла из хранилища" });
    }

    // Используем deleteOne вместо remove
    await File.deleteOne({ fileName });

    res.status(200).json({ message: "Файл успешно удалён" });
  } catch (error) {
    console.error("Ошибка при удалении файла:", error);
    res.status(500).json({ message: "Ошибка при удалении файла" });
  }
});

module.exports = router;
