const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const patientController = require("../controllers/patientController");

// [1] Получение списка клиник, с которыми взаимодействовал пациент
router.get("/clinics", authMiddleware, patientController.getClinicsForPatient);

// [2] Получение документов пациента от конкретной клиники по её id
router.get("/clinics/:clinicId/documents", authMiddleware, patientController.getClinicDocumentsForPatient);

module.exports = router;
