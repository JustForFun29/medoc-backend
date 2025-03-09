// routes/documentRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const authMiddleware = require("../middleware/authMiddleware");
const documentController = require("../controllers/documentController");

// [1] Отправка документа на подписание используя шаблон (POST /api/documents/send)
router.post("/send", authMiddleware, documentController.sendDocument);

// [2] Отправка документа на подписание используя личный файл (POST /api/documents/upload-and-send)
router.post("/upload-and-send", authMiddleware, upload.single("file"), documentController.uploadAndSendDocument);

// [3] Отправка СМС для пациента с ссылкой на подписание документа (POST /api/documents/send-on-sign)
router.post("/send-on-sign", authMiddleware, documentController.sendSMSForSigning);

// [4] Удаление документа (DELETE /api/documents/delete/:documentId)
router.delete("/delete/:documentId", authMiddleware, documentController.deleteDocument);

// [5] Получение списка документов используя фильтры, для клиники (GET /api/documents/sent-documents)
router.get("/sent-documents", authMiddleware, documentController.getSentDocuments);

// [6] Получение списка документов используя фильтры, для пациента (GET /api/documents/for-patient)
router.get("/for-patient", authMiddleware, documentController.getDocumentsForPatient);

// [7] Получение документа и статуса подписания используя document ID (GET /api/documents/:documentId) 
router.get("/:documentId", authMiddleware, documentController.getDocumentById);

// [8] Тестовый запрос для создания pdf файла из любого другого формата (POST /api/documents/generate-pdf)
router.post("/generate-pdf", authMiddleware, documentController.generatePdfFromTemplate);

module.exports = router;