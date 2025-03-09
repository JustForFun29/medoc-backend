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

// [1] Получение документов (GET /api/files)
router.get("/", authMiddleware, getFiles);

// [2] Загрузка файла (POST /api/files/upload)
router.post("/upload", authMiddleware, upload.single("file"), uploadFile);

// [3] Удаление файла (DELETE /api/files/:fileName)
router.delete("/:id", authMiddleware, deleteFile);

// [4] Получение pdf-превью (GET /api/files/:id/pdfPreview)
router.get("/:id/pdf", authMiddleware, getPdfPreview);

// [5] Получение png-превью (GET /api/files/:id/png)
router.get("/:id/png", authMiddleware, getPngPreview);

module.exports = router;
