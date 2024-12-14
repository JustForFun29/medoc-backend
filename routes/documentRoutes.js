const express = require("express");
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware"); // Для проверки авторизации

const router = express.Router();

// POST: Создание процесса подписания документа
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const {
      recipientName, // Полное ФИО подписанта
      recipientPhoneNumber,
      documentTitle, // Название документа
    } = req.body;

    // Проверяем, есть ли файл с указанным названием документа
    const file = await File.findOne({ documentTitle });
    if (!file) {
      return res
        .status(404)
        .json({ message: "Файл с указанным названием не найден" });
    }

    // Если файл не является публичным, проверяем права доступа
    if (!file.isPublic && !file.createdBy.equals(req.user.id)) {
      return res
        .status(403)
        .json({ message: "У вас нет доступа к этому файлу" });
    }

    // Получаем данные о клинике из авторизованного пользователя
    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    // Создаём документ в базе данных
    const newDocument = new Document({
      title: documentTitle, // Используем название документа
      fileUrl: file.filePath, // Путь к файлу
      recipient: {
        name: recipientName, // Полное ФИО подписанта
        phoneNumber: recipientPhoneNumber,
      },
      sender: {
        clinicName: clinic.clinicName,
        name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`, // Полное ФИО отправителя
        phoneNumber: clinic.phoneNumber,
      },
    });

    await newDocument.save();

    // Возвращаем ответ
    res.status(201).json({
      message: "Процесс подписания успешно начат",
      document: {
        id: newDocument._id,
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
      message: "Ошибка при создании процесса подписания",
      error: error.message,
    });
  }
});

// GET: Получение всех отправленных документов с фильтрацией и пагинацией
router.get("/sent-documents", authMiddleware, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status, // Новый фильтр по статусу
      recipientName, // Новый фильтр по имени подписанта
      recipientPhoneNumber, // Новый фильтр по номеру телефона подписанта
      page = 1, // Номер страницы (по умолчанию 1)
      limit = 10, // Лимит документов на странице (по умолчанию 10)
    } = req.query;

    // Получаем данные о клинике из авторизованного пользователя
    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    // Создаём базовый фильтр для поиска
    const filters = {
      "sender.phoneNumber": clinic.phoneNumber, // Только документы, отправленные данной клиникой
    };

    // Добавляем фильтр по дате (если указан)
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate)
        filters.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate)
        filters.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    // Добавляем фильтр по статусу (если указан)
    if (status) {
      const validStatuses = ["Отправлен", "Отклонён", "Подписан"];
      if (validStatuses.includes(status)) {
        filters.status = status;
      } else {
        return res.status(400).json({ message: "Недопустимый статус" });
      }
    }

    // Добавляем фильтр по имени подписанта (если указан)
    if (recipientName) {
      filters["recipient.name"] = { $regex: recipientName, $options: "i" }; // Регистронезависимый поиск
    }

    // Добавляем фильтр по номеру телефона подписанта (если указан)
    if (recipientPhoneNumber) {
      filters["recipient.phoneNumber"] = {
        $regex: recipientPhoneNumber,
        $options: "i",
      };
    }

    // Пагинация
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    // Выполняем поиск с учётом фильтров и пагинации
    const documents = await Document.find(filters)
      .sort({ createdAt: -1 }) // Сортировка по дате
      .skip(skip)
      .limit(pageSize)
      .select("recipient sender fileUrl status createdAt");

    // Подсчёт общего количества документов
    const totalDocuments = await Document.countDocuments(filters);

    // Возвращаем данные с пагинацией
    res.status(200).json({
      documents,
      pagination: {
        total: totalDocuments,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalDocuments / pageSize),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Ошибка при получении документов",
      error: error.message,
    });
  }
});

module.exports = router;
