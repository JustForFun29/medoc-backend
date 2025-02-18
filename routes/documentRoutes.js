const express = require("express");
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const Contractor = require("../models/Contractor");
const authMiddleware = require("../middleware/authMiddleware");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");
const multer = require("multer");

const { Readable } = require("stream");
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const BUCKET_NAME = "docuflow-storage";

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

// Отправка документа на подписание, используя загруженные шаблоны для авторизованной клиники
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const { recipientName, recipientPhoneNumber, documentTitle } = req.body;

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    // Создаем документ
    const newDocument = new Document({
      title: documentTitle,
      fileUrl: `https://s3.cloud.ru/docuflow-storage/documents/${documentTitle}.pdf`, // Здесь нужно вставить реальный URL загруженного файла
      recipient: { name: recipientName, phoneNumber: recipientPhoneNumber },
      sender: {
        clinicName: clinic.clinicName,
        name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`,
        phoneNumber: clinic.phoneNumber,
      },
      status: "Отправлен",
    });

    await newDocument.save();

    // Проверяем, есть ли уже такой контрагент в этой клинике
    let contractor = await Contractor.findOne({
      clinicId: clinic._id,
      phoneNumber: recipientPhoneNumber,
    });

    if (!contractor) {
      // Создаем нового контрагента
      contractor = new Contractor({
        clinicId: clinic._id,
        firstName: recipientName.split(" ")[1] || "",
        lastName: recipientName.split(" ")[0] || "",
        fathersName: recipientName.split(" ")[2] || "",
        phoneNumber: recipientPhoneNumber,
        documentIds: [newDocument._id],
      });
    } else {
      // Добавляем новый документ в массив
      contractor.documentIds.push(newDocument._id);
    }

    await contractor.save();

    res.status(201).json({
      message: "Процесс подписания успешно начат",
      document: {
        id: newDocument._id,
        documentTitle: newDocument.documentTitle,
        recipient: newDocument.recipient,
        sender: newDocument.sender,
        fileUrl: newDocument.fileUrl,
        status: newDocument.status,
        createdAt: newDocument.createdAt,
      },
    });
  } catch (error) {
    console.error("Ошибка при отправке документа:", error);
    res.status(500).json({ message: "Ошибка при отправке документа" });
  }
});

// Отправка документа с новым файлом для подписания
router.post(
  "/upload-and-send",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      const { documentTitle, recipientName, recipientPhoneNumber } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Файл отсутствует в запросе" });
      }

      const clinic = await Clinic.findById(req.user.id);
      if (!clinic) {
        return res.status(403).json({ message: "Клиника не авторизована" });
      }

      // Генерируем уникальное имя файла
      const uniqueFileName = `${Date.now()}-${randomUUID()}`;
      const folderName = `${clinic.clinicName.replace(/\s/g, "_")}-documents/`;
      const fileKey = `${folderName}${uniqueFileName}`;

      // Загружаем файл в S3
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };

      try {
        await s3Client.send(new PutObjectCommand(uploadParams));
      } catch (s3Error) {
        console.error("Ошибка загрузки в S3:", s3Error);
        return res.status(500).json({ message: "Ошибка загрузки в хранилище" });
      }

      // Создаём новый документ в базе данных
      const newDocument = new Document({
        title: documentTitle,
        documentTitle,
        fileUrl: `https://s3.cloud.ru/${BUCKET_NAME}/${fileKey}`,
        recipient: { name: recipientName, phoneNumber: recipientPhoneNumber },
        sender: {
          clinicName: clinic.clinicName,
          name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`,
          phoneNumber: clinic.phoneNumber,
        },
        status: "Отправлен",
      });

      await newDocument.save();

      // 🔽 🔽 🔽 Логика работы с контрагентами 🔽 🔽 🔽
      let contractor = await Contractor.findOne({
        clinicId: clinic._id,
        phoneNumber: recipientPhoneNumber,
      });

      if (!contractor) {
        // Создаем нового контрагента
        contractor = new Contractor({
          clinicId: clinic._id,
          firstName: recipientName.split(" ")[1] || "",
          lastName: recipientName.split(" ")[0] || "",
          fathersName: recipientName.split(" ")[2] || "",
          phoneNumber: recipientPhoneNumber,
          documentIds: [newDocument._id],
        });
      } else {
        // Если контрагент уже есть – просто добавляем новый документ
        contractor.documentIds.push(newDocument._id);
      }

      await contractor.save();

      // 🔼 🔼 🔼 Конец логики работы с контрагентами 🔼 🔼 🔼

      res.status(201).json({
        message: "Файл загружен и документ создан для подписания",
        document: {
          id: newDocument._id,
          documentTitle: newDocument.documentTitle,
          fileUrl: newDocument.fileUrl,
          recipient: newDocument.recipient,
          sender: newDocument.sender,
          status: newDocument.status,
          createdAt: newDocument.createdAt,
        },
      });
    } catch (error) {
      console.error("Ошибка при загрузке и отправке документа:", error);
      res.status(500).json({ message: "Ошибка при обработке запроса" });
    }
  }
);

// Удаление документа со статусами Отправлен или Отклонён для авторизованной клиники
router.delete("/delete/:documentId", authMiddleware, async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await Document.findById(documentId);

    if (!document) {
      return res.status(404).json({ message: "Документ не найден" });
    }

    if (!["Отправлен", "Отклонён"].includes(document.status)) {
      return res
        .status(400)
        .json({ message: "Документ нельзя удалить, так как он уже подписан" });
    }

    const clinic = await Clinic.findById(req.user.id);

    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    if (document.sender.phoneNumber !== clinic.phoneNumber) {
      return res
        .status(403)
        .json({ message: "У вас нет прав на удаление этого документа" });
    }

    await Document.deleteOne({ _id: documentId });

    res.status(200).json({
      message: "Документ успешно удалён",
      documentTitle: document.documentTitle, // Добавлено поле
      dateSigned: document.dateSigned || null, // Добавлено поле
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Ошибка при удалении документа",
      error: error.message,
    });
  }
});

// Получение отправленных документов для авторизованной клиники с фильтрами
router.get("/sent-documents", authMiddleware, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      recipientName,
      recipientPhoneNumber,
      page = 1,
      limit = 10,
    } = req.query;

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    const filters = {
      "sender.phoneNumber": clinic.phoneNumber,
    };

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate)
        filters.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate)
        filters.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    if (status) {
      const statusMapping = {
        docSent: "Отправлен",
        docRejected: "Отклонён",
        docSigned: "Подписан",
      };

      let statusArray = Array.isArray(status) ? status : [status];
      statusArray = statusArray.map((s) => statusMapping[s]).filter(Boolean);

      if (statusArray.length) {
        filters.status = { $in: statusArray };
      }
    }

    if (recipientName) {
      filters["recipient.name"] = { $regex: recipientName, $options: "i" };
    }

    if (recipientPhoneNumber) {
      filters["recipient.phoneNumber"] = {
        $regex: recipientPhoneNumber,
        $options: "i",
      };
    }

    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    const documents = await Document.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select("title recipient sender fileUrl status createdAt dateSigned");

    const totalDocuments = await Document.countDocuments(filters);

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

// Получение списка документов для авторизованного пациента
router.get("/for-patient", authMiddleware, async (req, res) => {
  try {
    const { clinicName, page = 1, limit = 10 } = req.query;

    const filters = { "recipient.phoneNumber": req.user.phoneNumber };

    if (clinicName) {
      filters["sender.clinicName"] = { $regex: clinicName, $options: "i" };
    }

    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    const documents = await Document.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select("title sender fileUrl status createdAt");

    const groupedDocuments = documents.reduce((acc, doc) => {
      const clinicName = doc.sender.clinicName;
      if (!acc[clinicName]) {
        acc[clinicName] = [];
      }
      acc[clinicName].push(doc);
      return acc;
    }, {});

    res.status(200).json({
      groupedDocuments,
      pagination: {
        total: await Document.countDocuments(filters),
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(
          (await Document.countDocuments(filters)) / pageSize
        ),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Ошибка при получении документов для пациента",
      error: error.message,
    });
  }
});

// Получение списка контрагентов с фильтрами
router.get("/contractors", authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      recipientName,
      recipientPhoneNumber,
      consentToEDO,
    } = req.query;

    const pageSize = parseInt(limit, 10);
    const pageNumber = parseInt(page, 10);
    const skip = (pageNumber - 1) * pageSize;

    if (![10, 20, 30, 40, 50].includes(pageSize)) {
      return res.status(400).json({ message: "Некорректное значение limit" });
    }

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    // Основные фильтры
    const filters = {
      "sender.phoneNumber": clinic.phoneNumber, // Ограничиваем поиск по клинике
    };

    if (recipientName) {
      filters["recipient.name"] = { $regex: new RegExp(recipientName, "i") };
    }

    if (recipientPhoneNumber) {
      filters["recipient.phoneNumber"] = {
        $regex: new RegExp(recipientPhoneNumber, "i"),
      };
    }

    // Получаем все уникальные документы, отправленные данной клиникой
    const documents = await Document.find(filters)
      .select("recipient.name recipient.phoneNumber status title")
      .sort({ createdAt: -1 });

    // Используем Map для группировки подписантов
    const contractorsMap = new Map();

    documents.forEach((doc) => {
      const phone = doc.recipient.phoneNumber;

      if (!contractorsMap.has(phone)) {
        contractorsMap.set(phone, {
          recipientName: doc.recipient.name,
          recipientPhoneNumber: phone,
          signedDocumentsCount: 0,
          consentToEDO: false,
        });
      }

      // Учитываем все подписанные документы
      if (doc.status === "Подписан") {
        contractorsMap.get(phone).signedDocumentsCount += 1;
      }

      // Проверяем согласие на ЭДО
      if (doc.title === "Согласие на ЭДО" && doc.status === "Подписан") {
        contractorsMap.get(phone).consentToEDO = true;
      }
    });

    // Преобразуем в массив
    let contractorsArray = Array.from(contractorsMap.values());

    // Фильтрация по `consentToEDO`
    if (consentToEDO === "true") {
      contractorsArray = contractorsArray.filter(
        (c) => c.consentToEDO === true
      );
    } else if (consentToEDO === "false") {
      contractorsArray = contractorsArray.filter(
        (c) => c.consentToEDO === false
      );
    }

    // Общее количество элементов перед пагинацией
    const total = contractorsArray.length;

    // Пагинация
    const paginatedContractors = contractorsArray.slice(skip, skip + pageSize);

    res.status(200).json({
      contractors: paginatedContractors,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Ошибка при получении контрагентов:", error);
    res.status(500).json({ message: "Ошибка при получении контрагентов" });
  }
});

// Тестовый маршрут для получения документа
router.get("/test/document", authMiddleware, async (req, res) => {
  try {
    // Захардкоженные данные документа
    const testDocument = {
      id: "676fcd3ae58751778ccbbc99",
      title: "Договор на оказание медицинских услуг",
      recipient: {
        name: "Иванов Сергей Петрович",
        phoneNumber: "79991234567",
      },
      sender: {
        clinicName: "Медицинский Центр 'Здоровье'",
        name: "Анна Владимировна Смирнова",
        phoneNumber: "79997654321",
      },
      status: "Подписан",
      createdAt: new Date().toISOString(),
    };

    // Загружаем файл из S3 (из папки documents)
    const fileKey = "documents/Договор на оказание мед услуг.pdf";

    const getParams = {
      Bucket: "docuflow-storage",
      Key: fileKey,
    };

    const fileData = await s3Client.send(new GetObjectCommand(getParams));

    // Читаем поток данных файла
    const fileContent = await streamToBuffer(fileData.Body);

    // Возвращаем данные о документе и файл
    res.status(200).json({
      document: testDocument,
      fileContent: fileContent.toString("base64"), // Конвертируем содержимое файла в Base64
    });
  } catch (error) {
    console.error("Ошибка при получении тестового документа:", error);
    res
      .status(500)
      .json({ message: "Ошибка при получении тестового документа" });
  }
});

// Утилита для преобразования потока (Readable) в буфер
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

router.get("/contractor/:contractorId/documents", authMiddleware, async (req, res) => {
  try {
    const { contractorId } = req.params;

    // Ищем контрагента и подтягиваем его документы
    const contractor = await Contractor.findOne({
      _id: contractorId,
      clinicId: req.user.id, // Ограничиваем поиск только для клиники пользователя
    }).populate("documentIds");

    if (!contractor) {
      return res.status(404).json({ message: "Контрагент не найден" });
    }

    res.status(200).json({
      contractor: {
        id: contractor._id,
        firstName: contractor.firstName,
        lastName: contractor.lastName,
        fathersName: contractor.fathersName,
        phoneNumber: contractor.phoneNumber,
      },
      documents: contractor.documentIds.map((doc) => ({
        id: doc._id,
        title: doc.title,
        status: doc.status,
        createdAt: doc.createdAt,
        fileUrl: doc.fileUrl,
      })),
    });
  } catch (error) {
    console.error("Ошибка при получении документов контрагента:", error);
    res.status(500).json({ message: "Ошибка при получении документов контрагента" });
  }
});

// Получение документа по ID
router.get("/:documentId", authMiddleware, async (req, res) => {
  const { documentId } = req.params;

  try {
    // Извлекаем данные документа
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Документ не найден" });
    }

    // Получаем связанный файл из базы данных
    const file = await File.findOne({ filePath: document.fileUrl });
    if (!file) {
      return res.status(404).json({ message: "Файл для документа не найден" });
    }

    const fileKey = file.filePath.split(`${process.env.CLOUD_BUCKET_NAME}/`)[1]; // Извлекаем ключ объекта

    // Загружаем файл из S3
    const getParams = {
      Bucket: process.env.CLOUD_BUCKET_NAME,
      Key: fileKey,
    };

    const fileData = await s3Client.send(new GetObjectCommand(getParams));

    // Читаем поток данных файла
    const fileContent = await streamToBuffer(fileData.Body);

    // Возвращаем данные о документе и файл
    res.status(200).json({
      document: {
        id: document._id,
        title: document.title,
        recipient: document.recipient,
        sender: document.sender,
        status: document.status,
        createdAt: document.createdAt,
      },
      fileContent: fileContent.toString("base64"), // Конвертируем содержимое файла в Base64
    });
  } catch (error) {
    console.error("Ошибка при получении файла документа:", error);
    res.status(500).json({ message: "Ошибка при получении файла" });
  }
});

// Утилита для преобразования потока (Readable) в буфер
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = router;
