// routes/fileRoutes.js

const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getFiles,
  uploadFile,
  deleteFile,
  getPdfPreview,
  getPngPreview,
} = require("../controllers/fileController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Получение документов (GET /api/files)
router.get("/", authMiddleware, getFiles);

// Загрузка файла (POST /api/files/upload)
router.post("/upload", authMiddleware, upload.single("file"), uploadFile);

// Удаление файла (DELETE /api/files/:fileName)
router.delete("/:fileName", authMiddleware, deleteFile);

// Получение pdf-превью (GET /api/files/:id/pdfPreview)
router.get("/:id/pdf", authMiddleware, getPdfPreview);

// Аналогично можно сделать (GET /api/files/:id/png) -> getPngPreview
router.get("/:id/png", authMiddleware, getPngPreview);

module.exports = router;
