// routes/documentRoutes.js
const express = require("express");
const { createDocument } = require("../controllers/documentController");
const router = express.Router();

// Маршрут для создания нового документа
router.post("/create", createDocument);

module.exports = router;
