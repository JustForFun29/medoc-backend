const express = require("express");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const Contractor = require("../models/Contractor");
const authMiddleware = require("../middleware/authMiddleware");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
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

async function addDocumentToContractor(recipientName, recipientPhoneNumber, documentId, clinicId) {
  try {
    let contractor = await Contractor.findOne({
      phoneNumber: recipientPhoneNumber,
      clinicId: clinicId,
    });

    if (!contractor) {
      console.log("Контрагент не найден, создаем нового...");
      const [lastName, firstName, fathersName] = recipientName.split(" ");
      contractor = new Contractor({
        firstName: firstName || "",
        lastName: lastName || "",
        fathersName: fathersName || "",
        phoneNumber: recipientPhoneNumber,
        clinicId,
        documentIds: [documentId],
      });

      await contractor.save();
      console.log("✅ Контрагент создан с первым документом:", contractor);
      return;
    }

    console.log("Контрагент найден:", contractor);

    // ✅ Используем `$addToSet` для гарантированного добавления ID
    const updatedContractor = await Contractor.findByIdAndUpdate(
      contractor._id,
      { $addToSet: { documentIds: documentId } }, // Вместо `$push`
      { new: true, useFindAndModify: false }
    );

    console.log("✔ Контрагент обновлен в базе:", updatedContractor);
  } catch (error) {
    console.error("❌ Ошибка при обновлении контрагента:", error);
  }
}


// Отправка документа на подписание, используя загруженные шаблоны для авторизованной клиники
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const { recipientName, recipientPhoneNumber, documentTitle } = req.body;

    if (!recipientName || !recipientPhoneNumber || !documentTitle) {
      return res.status(400).json({
        message: "Ошибка: необходимо передать recipientName, recipientPhoneNumber и documentTitle",
      });
    }

    const file = await File.findOne({ documentTitle });
    if (!file) {
      return res
        .status(404)
        .json({ message: "Файл с указанным названием не найден" });
    }

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    const newDocument = new Document({
      title: documentTitle,
      documentTitle,
      recipient: {
        name: recipientName,
        phoneNumber: recipientPhoneNumber,
      },
      sender: {
        clinicName: clinic.clinicName,
        name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`,
        phoneNumber: clinic.phoneNumber,
      },
      bucket: file.bucket || BUCKET_NAME,
      objectKey: file.objectKey || "",  // Или получаем из file.filePath
      storageClass: "STANDARD" // STANDARD по умолчанию
    });

    await newDocument.save();

    // ✅ Добавляем документ в контрагента
    await addDocumentToContractor(recipientName, recipientPhoneNumber, newDocument._id, clinic._id);

    res.status(201).json({
      message: "Процесс подписания успешно начат",
      document: {
        id: newDocument._id,
        documentTitle: newDocument.documentTitle,
        recipient: newDocument.recipient,
        sender: newDocument.sender,
        bucket: newDocument.bucket,
        objectKey: newDocument.objectKey,
        storageClass: newDocument.storageClass,
        createdAt: newDocument.createdAt,
      },
    });
  } catch (error) {
    console.error("Ошибка при отправке документа:", error);
    res.status(500).json({
      message: "Ошибка при создании процесса подписания",
      error: error.message,
    });
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
      const folderName = `${clinic.clinicName.replace(/\s/g, "_")}_документы/`;
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
        recipient: { name: recipientName, phoneNumber: recipientPhoneNumber },
        sender: {
          clinicName: clinic.clinicName,
          name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`,
          phoneNumber: clinic.phoneNumber,
        },
        bucket: BUCKET_NAME,
        objectKey: fileKey,
        storageClass: "STANDARD",
      });

      await newDocument.save();

      await addDocumentToContractor(recipientName, recipientPhoneNumber, newDocument._id, clinic._id);


      res.status(201).json({
        message: "Файл загружен и документ создан для подписания",
        document: {
          id: newDocument._id,
          documentTitle: newDocument.documentTitle,
          bucket: newDocument.bucket,
          objectKey: newDocument.objectKey,
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
      return res.status(400).json({
        message: "Документ нельзя удалить, так как он уже подписан"
      });
    }

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    if (document.sender.phoneNumber !== clinic.phoneNumber) {
      return res.status(403).json({
        message: "У вас нет прав на удаление этого документа"
      });
    }

    // Удалить физически из S3
    await s3Client.send(new DeleteObjectCommand({
      Bucket: document.bucket,
      Key: document.objectKey
    }));

    await Document.deleteOne({ _id: documentId });

    res.status(200).json({
      message: "Документ успешно удалён",
      documentTitle: document.documentTitle,
      dateSigned: document.dateSigned || null,
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
      .select("title recipient sender status createdAt dateSigned");

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
      .select("title sender status createdAt");

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

/**
 * Тестовый маршрут для ручного перемещения файла между бакетами.
 * Шлём sourceBucket, targetBucket, objectKey, и смотрим, как происходит копирование.
 *
 * Пример: 
 *  POST /api/documents/test/move
 *  Body: {
 *    "sourceBucket": "docuflow-storage",
 *    "targetBucket": "docuflow-storage-cold",
 *    "objectKey": "Клиника_Докомоед-documents/1739904421818-3fdabdfd-0097-4342-889b-f0b947a6707d"
 *  }
 */
router.post("/test/move", authMiddleware, async (req, res) => {
  try {
    const { sourceBucket, targetBucket, objectKey } = req.body;

    if (!sourceBucket || !targetBucket || !objectKey) {
      return res.status(400).json({
        message: "Необходимо передать sourceBucket, targetBucket и objectKey"
      });
    }

    // Вызываем вашу функцию копирования
    await moveObjectBetweenBuckets({ sourceBucket, targetBucket, objectKey });

    res.status(200).json({
      message: "Файл успешно перемещён",
      from: sourceBucket,
      to: targetBucket,
      objectKey
    });
  } catch (error) {
    console.error("Ошибка при перемещении файла:", error);
    res.status(500).json({
      message: "Ошибка при перемещении файла",
      error: error.message
    });
  }
});

// В том же documentRoutes.js (только для демонстрации!)
router.get("/test/fetch-file", authMiddleware, async (req, res) => {
  try {
    const { bucket, objectKey } = req.query;
    if (!bucket || !objectKey) {
      return res.status(400).json({
        message: "Необходимо передать ?bucket=<...>&objectKey=<...>"
      });
    }

    // Скачиваем из S3
    const getParams = {
      Bucket: bucket,
      Key: objectKey
    };
    const fileData = await s3Client.send(new GetObjectCommand(getParams));
    const fileContent = await streamToBuffer(fileData.Body);

    // Возвращаем Base64
    res.status(200).json({
      bucket,
      objectKey,
      base64: fileContent.toString("base64")
    });
  } catch (error) {
    console.error("Ошибка при чтении файла:", error);
    res.status(500).json({
      message: "Ошибка при чтении файла",
      error: error.message
    });
  }
});


// Получение документа по ID
router.get("/:documentId", authMiddleware, async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Документ не найден" });
    }

    // Если документ не в STANDARD — переносим обратно
    if (document.storageClass !== "STANDARD") {
      console.log(`Переводим документ ${documentId} обратно в STANDARD-хранилище...`);

      // Синхронный вызов moveObjectBetweenBuckets
      await moveObjectBetweenBuckets({
        sourceBucket: document.bucket,
        targetBucket: BUCKET_NAME, // например, "docuflow-storage"
        objectKey: document.objectKey,
      });

      // Обновляем поля
      document.bucket = BUCKET_NAME;
      document.storageClass = "STANDARD";
    }

    // В любом случае обновляем lastAccessed
    document.lastAccessed = new Date();
    await document.save();

    // Теперь документ точно лежит в STANDARD_BUCKET
    const getParams = {
      Bucket: document.bucket,      // уже "docuflow-storage"
      Key: document.objectKey,
    };

    const fileData = await s3Client.send(new GetObjectCommand(getParams));
    const fileContent = await streamToBuffer(fileData.Body);

    res.status(200).json({
      document: {
        id: document._id,
        title: document.title,
        recipient: document.recipient,
        sender: document.sender,
        status: document.status,
        storageClass: document.storageClass,
        lastAccessed: document.lastAccessed,
        createdAt: document.createdAt,
      },
      fileContent: fileContent.toString("base64"),
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


async function moveObjectBetweenBuckets({
  sourceBucket,
  targetBucket,
  objectKey,
}) {
  // 1) Copy
  await s3Client.send(
    new CopyObjectCommand({
      CopySource: encodeURI(`${sourceBucket}/${objectKey}`),
      Bucket: targetBucket,
      Key: objectKey,
    })
  );

  // 2) Delete
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: sourceBucket,
      Key: objectKey,
    })
  );
}

module.exports = router;
