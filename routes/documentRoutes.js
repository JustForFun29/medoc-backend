const express = require("express");
const { v4: uuidv4 } = require("uuid"); // Для генерации уникального ID процесса
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware"); // Для проверки авторизации

const router = express.Router();

// POST: Создание процесса подписания документа
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const {
      recipientFirstName,
      recipientLastName,
      recipientFathersName,
      recipientPhoneNumber,
      fileName,
    } = req.body;

    // Проверяем, есть ли файл с указанным именем
    const file = await File.findOne({ fileName });
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Получаем данные о клинике из авторизованного пользователя
    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Clinic not authorized" });
    }

    // Генерируем уникальный ID процесса подписания
    const signingProcessId = uuidv4();

    // Создаём документ в базе данных
    const newDocument = new Document({
      title: `Signing Process ${signingProcessId}`,
      fileUrl: file.filePath, // Используем путь файла
      recipient: {
        name: `${recipientLastName} ${recipientFirstName} ${recipientFathersName}`, // Формируем ФИО
        phoneNumber: recipientPhoneNumber,
      },
      sender: {
        name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`, // Используем данные из авторизованной клиники
        phoneNumber: clinic.phoneNumber,
      },
    });

    await newDocument.save();

    // Возвращаем ответ
    res.status(201).json({
      message: "Signing process started successfully",
      signingProcessId,
      document: {
        id: newDocument._id,
        title: newDocument.title,
        recipient: newDocument.recipient,
        sender: newDocument.sender,
        fileUrl: newDocument.fileUrl,
        status: newDocument.status,
        createdAt: newDocument.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error starting the signing process",
      error: error.message,
    });
  }
});

module.exports = router;
