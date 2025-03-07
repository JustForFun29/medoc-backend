const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
    searchContractors,
    createContractor,
    deleteContractor,
    getContractorDocuments
} = require("../controllers/contractorController");

const router = express.Router();

// [1] Получение контрагентов с фильтрами (GET /api/contractors/)
router.get("/", authMiddleware, searchContractors);

// [2] Получение контрагентов по выбранным фильтрам  (POST /api/contractors/)
router.post("/", authMiddleware, createContractor);

// [3] Получение контрагентов по выбранным фильтрам (DELETE /api/contractors/:contractorId)
router.delete("/:contractorId", authMiddleware, deleteContractor);

// [4] Получение контрагентов по выбранным фильтрам (GET /api/contractors/:contractorId/documents)
router.get("/:contractorId/documents", authMiddleware, getContractorDocuments);

module.exports = router;
