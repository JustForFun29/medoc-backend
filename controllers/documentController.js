// controllers/documentController.js
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const Contractor = require("../models/Contractor");
const { randomUUID } = require("crypto");
const { addDocumentToContractor } = require("../services/contractorService")
const { generatePdfFromDocxTemplate } = require("../services/templateService");
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../utils/s3Client");
const { streamToBuffer, moveObjectBetweenBuckets } = require("../utils/fileUtils");
const { BUCKET_NAME } = require("../config");
const axios = require("axios");

exports.sendDocument = async (req, res) => {
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

    // Скачиваем исходный файл из S3
    const fileData = await s3Client.send(
      new GetObjectCommand({
        Bucket: file.bucket || BUCKET_NAME,
        Key: file.objectKey || `files/${file.fileName}`,
      })
    );

    // ⚠️ Преобразовываем поток в буфер
    const fileBuffer = await streamToBuffer(fileData.Body);

    // Генерируем уникальное имя файла
    const uniqueFileName = `${Date.now()}-${randomUUID()}`;
    const folderName = `${clinic.clinicName.replace(/\s/g, "_")}_документы/`;
    const fileKey = `${folderName}${uniqueFileName}`;

    // Загружаем буфер (не поток!) в S3 под новым ключом
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: fileBuffer, // ✅ Используем буфер
        ContentType: file.contentType || "application/octet-stream",
      })
    );

    // Создаём новый документ
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
      status: "Подготовлен",
      events: [
        {
          type: "Подготовлен",
          timestamp: new Date(),
        },
      ],
    });

    await newDocument.save();

    // Добавляем документ в контрагента
    await addDocumentToContractor(
      recipientName,
      recipientPhoneNumber,
      newDocument._id,
      clinic._id
    );

    res.status(201).json({
      message: "Процесс подписания успешно начат - документ подготовлен для отправки",
      document: {
        id: newDocument._id,
        documentTitle: newDocument.documentTitle,
        recipient: newDocument.recipient,
        sender: newDocument.sender,
        bucket: newDocument.bucket,
        objectKey: newDocument.objectKey,
        storageClass: newDocument.storageClass,
        createdAt: newDocument.createdAt,
        status: newDocument.status,
      },
    });
  } catch (error) {
    console.error("Ошибка при отправке документа:", error);
    res.status(500).json({
      message: "Ошибка при создании процесса подписания",
      error: error.message,
    });
  }
};


exports.uploadAndSendDocument = async (req, res) => {
  try {
    const { documentTitle, recipientName, recipientPhoneNumber } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Файл отсутствует в запросе" });
    }

    const clinic = await Clinic.findById(req.user.id);
    if (!clinic) {
      return res.status(403).json({ message: "Клиника не авторизована" });
    }

    // Проверяем, существует ли уже контрагент с таким номером телефона, но другим именем
    const existingContractor = await Contractor.findOne({
      phoneNumber: recipientPhoneNumber,
      clinicId: clinic._id,
    });

    if (existingContractor && existingContractor.firstName !== recipientName.split(" ")[1]) {
      return res.status(400).json({
        message: "Ошибка: номер телефона уже зарегистрирован с другим именем.",
      });
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

    // Создаём новый документ
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
      status: "Подготовлен",
      events: [
        {
          type: "Подготовлен",
          timestamp: new Date(),
        },
      ],
    });

    await newDocument.save();

    // Добавляем документ в контрагента
    await addDocumentToContractor(
      recipientName,
      recipientPhoneNumber,
      newDocument._id,
      clinic._id
    );

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

};

exports.sendSMSForSigning = async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ message: "documentId обязателен" });
    }

    // Ищем документ
    const doc = await Document.findById(documentId);
    if (!doc) {
      return res.status(404).json({ message: "Документ не найден" });
    }

    // Формируем текст SMS
    // Пример: "{ФИО}, {Название клиники} отправила вам документ на подписание..."
    const messageText = `${doc.recipient.name}, ${doc.sender.clinicName} отправила вам документ на подписание. Перейдите по ссылке https://docomed.ru для подписания`;

    // Отправляем запрос к внешнему SMS-сервису
    // Зависит от того, какой сервис вы используете:
    //    - возможно, нуждается в API-ключе, токене и т.д.
    //    - возможно, нужно другое поле вместо "message" и "phoneNumber"
    // Примерно так:
    const smsResponse = await axios.post("https://api.exolve.ru/messaging/v1/SendSMS", {
      number: process.env.MTS_PHONE,
      destination: doc.recipient.phoneNumber,
      text: messageText,
      // и любые другие нужные поля
    }, {
      headers: {
        Authorization: `Bearer ${process.env.MTS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // (Опционально) меняем статус на «Отправлен»
    // и фиксируем событие:
    doc.status = "Отправлен";
    if (doc.events) {
      doc.events.push({
        type: "Отправлен",
        timestamp: new Date(),
      });
    }
    await doc.save();

    // Возвращаем ответ
    return res.json({
      message: "СМС с приглашением на подписание отправлено",
      smsResponse: smsResponse.data, // данные, вернувшиеся от сервиса
    });
  } catch (error) {
    console.error("Ошибка при отправке СМС:", error);
    return res.status(500).json({
      message: "Ошибка при отправке СМС",
      error: error.message,
    });
  }
};

exports.deleteDocument = async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Документ не найден" });
    }

    if (!["Подготовлен", "Отклонён"].includes(document.status)) {
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
};


exports.getSentDocuments = async (req, res) => {
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
        docPrepared: "Подготовлен"
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
};


exports.getDocumentsForPatient = async (req, res) => {
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
      .select("title recipient sender status createdAt");

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
      message: "Ошибка при получении документов для пациента",
      error: error.message,
    });
  }
};


exports.getDocumentById = async (req, res) => {
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
        events: document.events
      },
      fileContent: fileContent.toString("base64"),
    });
  } catch (error) {
    console.error("Ошибка при получении файла документа:", error);
    res.status(500).json({ message: "Ошибка при получении файла" });
  }
};


exports.generatePdfFromTemplate = async (req, res) => {
  try {
    const { recipientName, recipientPhoneNumber, documentTitle } = req.body;
    // Берём данные из JWT
    const user = req.user;
    // user.clinicName и т.п.

    // Ищем в своей базе, какой шаблон нужен. Предположим, file.objectKey — это ключ в S3
    const file = await File.findOne({ documentTitle });
    if (!file) {
      return res.status(404).json({ message: "Шаблон не найден" });
    }

    // Формируем объект с данными для вставки
    const templateData = {
      patient_full_name: recipientName,
      patient_phone_number: recipientPhoneNumber,
      clinic_name: user.clinicName,
      clinic_full_name: `${user.lastName} ${user.firstName} ${user.fathersName}`,
    };

    // Генерируем PDF
    const pdfBuffer = await generatePdfFromDocxTemplate({
      bucket: BUCKET_NAME,
      objectKey: `files/${file.fileName}`,
      templateData,
    });

    // Превращаем PDF в base64
    const pdfBase64 = pdfBuffer.toString("base64");

    // Возвращаем JSON
    return res.json({
      success: true,
      pdfBase64,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка при генерации PDF", error: err.message });
  }
};
