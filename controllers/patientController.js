const Clinic = require("../models/Clinic");
const Document = require("../models/Document");

// [1] Получение списка клиник, которые взаимодействовали с пациентом
exports.getClinicsForPatient = async (req, res) => {
    try {
        const patientPhoneNumber = req.user.phoneNumber;

        const documents = await Document.find({
            "recipient.phoneNumber": patientPhoneNumber
        }).select("sender.clinicName sender.phoneNumber sender.name createdAt");

        const clinicsMap = new Map();

        documents.forEach((doc) => {
            const clinicKey = doc.sender.phoneNumber;
            if (!clinicsMap.has(clinicKey)) {
                clinicsMap.set(clinicKey, {
                    clinicName: doc.sender.clinicName,
                    senderName: doc.sender.name,
                    phoneNumber: doc.sender.phoneNumber,
                    lastInteraction: doc.createdAt,
                });
            } else {
                const existing = clinicsMap.get(clinicKey);
                if (doc.createdAt > existing.lastInteraction) {
                    existing.lastInteraction = doc.createdAt;
                }
            }
        });

        const clinicsArray = Array.from(clinicsMap.values());

        // Сортируем клиники по последнему взаимодействию
        clinicsArray.sort((a, b) => b.lastInteraction - a.lastInteraction);

        // Дополнительно, получаем _id клиник из базы
        const clinicsWithIds = await Promise.all(
            clinicsArray.map(async (clinic) => {
                const clinicRecord = await Clinic.findOne({ phoneNumber: clinic.phoneNumber }).select("_id");
                return {
                    ...clinic,
                    id: clinicRecord ? clinicRecord._id : null,
                };
            })
        );

        res.status(200).json({
            clinics: clinicsWithIds.filter(c => c.id !== null),
            totalClinics: clinicsWithIds.length,
        });
    } catch (error) {
        console.error("Ошибка при получении списка клиник для пациента:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};

// [2] Получение всех документов от конкретной клиники для пациента по clinicId
exports.getClinicDocumentsForPatient = async (req, res) => {
    try {
        const patientPhoneNumber = req.user.phoneNumber;
        const { clinicId } = req.params;

        const clinic = await Clinic.findById(clinicId).select("phoneNumber clinicName");
        if (!clinic) {
            return res.status(404).json({ message: "Клиника не найдена" });
        }

        const documents = await Document.find({
            "recipient.phoneNumber": patientPhoneNumber,
            "sender.phoneNumber": clinic.phoneNumber,
        }).select("title status createdAt sender recipient");

        res.status(200).json({
            clinic: {
                id: clinic._id,
                clinicName: clinic.clinicName,
                phoneNumber: clinic.phoneNumber,
            },
            documents,
            totalDocuments: documents.length,
        });
    } catch (error) {
        console.error("Ошибка при получении документов от клиники для пациента:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};
