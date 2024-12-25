const express = require("express");
const Document = require("../models/Document");
const File = require("../models/File");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// POST: Создание процесса подписания документа
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

// DELETE: Удаление документов со статусами "Отправлен" или "Отклонён"
router.delete("/delete/:documentId", authMiddleware, async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await Document.findById(documentId);

    if (!document) {
      return res.status(404).json({ message: "Документ не найден" });
    }

    if (!["Отправлен", "Отклонен"].includes(document.status)) {
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

    // Используем deleteOne вместо remove
    await Document.deleteOne({ _id: documentId });

    res.status(200).json({ message: "Документ успешно удалён" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Ошибка при удалении документа",
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
      const validStatuses = ["Отправлен", "Отклонён", "Подписан"];
      if (validStatuses.includes(status)) {
        filters.status = status;
      } else {
        return res.status(400).json({ message: "Недопустимый статус" });
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
      .select("recipient sender fileUrl status createdAt");

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

// GET: Получение документов для пациента, сгруппированных по клиникам
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

module.exports = router;
