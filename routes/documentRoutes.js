const express = require("express");
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const { Readable } = require("stream");
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

/**
 * @swagger
 * tags:
 *   - name: Document
 *     description: Эндпоинты для работы с документами
 */

/**
 * @swagger
 * /api/documents/send:
 *   post:
 *     tags:
 *       - Document
 *     summary: Отправка документа на подписание
 *     description: Отправляет документ на подписание определённому получателю.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipientName:
 *                 type: string
 *                 example: "Петров Иван Александрович"
 *               recipientPhoneNumber:
 *                 type: string
 *                 example: "71234567890"
 *               documentTitle:
 *                 type: string
 *                 example: "Договор аренды"
 *     responses:
 *       201:
 *         description: Документ успешно отправлен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Процесс подписания успешно начат"
 *                 document:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     documentTitle:
 *                       type: string
 *                       example: "Договор аренды"
 *                     recipient:
 *                       type: object
 *                     sender:
 *                       type: object
 *                     fileUrl:
 *                       type: string
 *                     status:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *     404:
 *       description: Файл с указанным названием не найден
 *     403:
 *       description: У вас нет доступа к этому файлу
 *     500:
 *       description: Ошибка сервера
 */
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const { recipientName, recipientPhoneNumber, documentTitle } = req.body;

    const file = await File.findOne({ documentTitle });
    if (!file) {
      return res
        .status(404)
        .json({ message: "Файл с указанным названием не найден" });
    }

    if (!file.isPublic && !file.createdBy.equals(req.user.id)) {
      return res
        .status(403)
        .json({ message: "У вас нет доступа к этому файлу" });
    }

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    const newDocument = new Document({
      title: documentTitle,
      fileUrl: file.filePath,
      documentTitle,
      recipient: { name: recipientName, phoneNumber: recipientPhoneNumber },
      sender: {
        clinicName: clinic.clinicName,
        name: `${clinic.lastName} ${clinic.firstName} ${clinic.fathersName}`,
        phoneNumber: clinic.phoneNumber,
      },
    });

    await newDocument.save();

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
    console.error(error);
    res.status(500).json({
      message: "Ошибка при создании процесса подписания",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/documents/delete/{documentId}:
 *   delete:
 *     tags:
 *       - Document
 *     summary: Удаление документа
 *     description: Удаляет документ со статусами "Отправлен" или "Отклонён".
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Идентификатор документа
 *     responses:
 *       200:
 *         description: Документ успешно удалён
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Документ успешно удалён"
 *                 documentTitle:
 *                   type: string
 *                   example: "Договор аренды"
 *                 dateSigned:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Документ не найден
 *       400:
 *         description: Документ нельзя удалить
 *       403:
 *         description: У вас нет прав на удаление этого документа
 *       500:
 *         description: Ошибка сервера
 */
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

/**
 * @swagger
 * /api/documents/sent-documents:
 *   get:
 *     tags:
 *       - Document
 *     summary: Получение отправленных документов
 *     description: Возвращает список отправленных документов с фильтрацией и пагинацией.
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Начальная дата фильтрации (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: Конечная дата фильтрации (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Отправлен, Отклонён, Подписан]
 *         description: Статус документа
 *       - in: query
 *         name: recipientName
 *         schema:
 *           type: string
 *         description: ФИО подписанта
 *       - in: query
 *         name: recipientPhoneNumber
 *         schema:
 *           type: string
 *         description: Номер телефона подписанта
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Количество документов на странице
 *     responses:
 *       200:
 *         description: Список документов с пагинацией
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       documentTitle:
 *                         type: string
 *                         example: "Договор аренды"
 *                       dateSigned:
 *                         type: string
 *                         format: date-time
 *                       recipient:
 *                         type: object
 *                       sender:
 *                         type: object
 *                       fileUrl:
 *                         type: string
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       500:
 *         description: Ошибка сервера
 */
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

/**
 * @swagger
 * /api/documents/for-patient:
 *   get:
 *     tags:
 *       - Document
 *     summary: Получение документов для пациента
 *     description: Возвращает документы для пациента, сгруппированные по клиникам.
 *     parameters:
 *       - in: query
 *         name: clinicName
 *         schema:
 *           type: string
 *         description: Название клиники для фильтрации
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Количество документов на странице
 *     responses:
 *       200:
 *         description: Список документов, сгруппированных по клиникам
 *       500:
 *         description: Ошибка сервера
 */
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

/**
 * @swagger
 * /api/documents/contractors:
 *   get:
 *     tags:
 *       - Document
 *     summary: Получение списка контрагентов (подписантов)
 *     description: |
 *       Возвращает список контрагентов, которым клиника отправляла документы.
 *       Контрагенты включают как подписавших документы, так и тех, кому они были отправлены.
 *       Также есть возможность фильтровать по согласию на электронный документооборот (ЭДО).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Номер страницы (по умолчанию 1).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           enum: [10, 20, 30, 40, 50]
 *           example: 10
 *         description: |
 *           Количество элементов на странице.
 *           Доступные значения: 10, 20, 30, 40, 50.
 *       - in: query
 *         name: recipientName
 *         schema:
 *           type: string
 *         description: Фильтр по ФИО подписанта (поддерживает частичное совпадение).
 *       - in: query
 *         name: recipientPhoneNumber
 *         schema:
 *           type: string
 *         description: Фильтр по номеру телефона подписанта (поддерживает частичное совпадение).
 *       - in: query
 *         name: consentToEDO
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: |
 *           Фильтр по согласию на ЭДО.
 *           - `true` — показываются только подписавшие "Согласие на ЭДО".
 *           - `false` — показываются подписанты без согласия на ЭДО.
 *     responses:
 *       200:
 *         description: Успешный ответ со списком контрагентов.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contractors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       recipientName:
 *                         type: string
 *                         example: "Иванов Петр Сергеевич"
 *                         description: Полное имя подписанта.
 *                       recipientPhoneNumber:
 *                         type: string
 *                         example: "79998887766"
 *                         description: Номер телефона подписанта.
 *                       signedDocumentsCount:
 *                         type: integer
 *                         example: 2
 *                         description: Количество подписанных документов.
 *                       consentToEDO:
 *                         type: boolean
 *                         example: true
 *                         description: Подписал ли контрагент "Согласие на ЭДО".
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     totalItems:
 *                       type: integer
 *                       example: 50
 *                       description: Общее количество контрагентов.
 *                     page:
 *                       type: integer
 *                       example: 1
 *                       description: Текущая страница.
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                       description: Количество элементов на странице.
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                       description: Общее количество страниц.
 *       400:
 *         description: Некорректные параметры запроса.
 *       403:
 *         description: Клиника не авторизована.
 *       500:
 *         description: Ошибка сервера при получении данных.
 */

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
    const totalItems = contractorsArray.length;

    // Пагинация
    const paginatedContractors = contractorsArray.slice(skip, skip + pageSize);

    res.status(200).json({
      contractors: paginatedContractors,
      pagination: {
        totalItems,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
  } catch (error) {
    console.error("Ошибка при получении контрагентов:", error);
    res.status(500).json({ message: "Ошибка при получении контрагентов" });
  }
});

/**
 * @swagger
 * /api/documents/{documentId}:
 *   get:
 *     tags:
 *       - Document
 *     summary: Получение содержимого файла документа
 *     description: Возвращает файл документа из хранилища объектов и его описание из базы данных.
 *     parameters:
 *       - name: documentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID документа
 *     responses:
 *       200:
 *         description: Файл и описание документа успешно получены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     recipient:
 *                       type: object
 *                     sender:
 *                       type: object
 *                     status:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                     documentTitle:
 *                       type: string
 *                     dateSigned:
 *                       type: string
 *                       format: date-time
 *                 fileContent:
 *                   type: string
 *                   format: binary
 *       404:
 *         description: Документ или файл не найден
 *       500:
 *         description: Ошибка при получении файла
 */
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
