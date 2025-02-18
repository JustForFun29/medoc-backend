const express = require("express");
const mongoose = require("mongoose");
const Contractor = require("../models/Contractor");
const Clinic = require("../models/Clinic");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * Поиск контрагентов по номеру телефона (частичному совпадению),
 * возвращаем максимум 3 результата.
 */
router.get("/", authMiddleware, async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        if (!phoneNumber) {
            return res.status(400).json({
                message: "Необходимо передать параметр phoneNumber",
            });
        }

        // Используем $regex для частичного совпадения.
        // Например, при phoneNumber=7900 вернёт все телефоны, содержащие "7900".
        // Можно дополнительно ограничить начало строки: new RegExp(`^${phoneNumber}`)
        const contractors = await Contractor.find({
            clinicId: clinic._id, // Показываем только контрагентов текущей клиники
            phoneNumber: { $regex: phoneNumber, $options: "i" },
        })
            .limit(3)
            .select("_id firstName lastName fathersName phoneNumber");

        res.status(200).json({ contractors });
    } catch (error) {
        console.error("Ошибка при поиске контрагентов:", error);
        res.status(500).json({ message: "Ошибка при поиске контрагентов" });
    }
});


router.post("/", authMiddleware, async (req, res) => {
    try {
        // Предполагаем, что req.user.id — это _id клиники
        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        const { firstName, lastName, fathersName, phoneNumber } = req.body;
        if (!firstName || !lastName || !phoneNumber) {
            return res
                .status(400)
                .json({ message: "Необходимо передать firstName, lastName и phoneNumber" });
        }

        // Проверяем, нет ли уже контрагента с таким телефоном у этой клиники
        const existingContractor = await Contractor.findOne({
            clinicId: clinic._id,
            phoneNumber,
        });

        if (existingContractor) {
            return res.status(400).json({
                message: "Контрагент с таким номером телефона уже существует",
            });
        }

        // Создаём нового контрагента
        const newContractor = new Contractor({
            clinicId: clinic._id,
            firstName,
            lastName,
            fathersName: fathersName || "",
            phoneNumber
            // documentIds: [] — по умолчанию пустой массив
        });

        await newContractor.save();

        res.status(201).json({
            message: "Контрагент успешно создан",
            contractor: {
                id: newContractor._id,
                firstName: newContractor.firstName,
                lastName: newContractor.lastName,
                fathersName: newContractor.fathersName,
                phoneNumber: newContractor.phoneNumber,
            },
        });
    } catch (error) {
        console.error("Ошибка при создании контрагента:", error);
        res.status(500).json({ message: "Ошибка при создании контрагента" });
    }
});


router.delete("/:contractorId", authMiddleware, async (req, res) => {
    try {
        const { contractorId } = req.params;

        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        // Ищем контрагента, принадлежащего этой клинике
        const contractor = await Contractor.findOne({
            _id: contractorId,
            clinicId: clinic._id,
        });

        if (!contractor) {
            return res.status(404).json({ message: "Контрагент не найден" });
        }

        // Проверяем, что у контрагента нет документов
        if (contractor.documentIds && contractor.documentIds.length > 0) {
            return res.status(400).json({
                message: "Нельзя удалить контрагента, у которого есть связанные документы",
            });
        }

        // Удаляем контрагента
        await Contractor.deleteOne({ _id: contractorId });

        res.status(200).json({ message: "Контрагент успешно удалён" });
    } catch (error) {
        console.error("Ошибка при удалении контрагента:", error);
        res
            .status(500)
            .json({ message: "Ошибка при удалении контрагента" });
    }
});


router.get("/:contractorId/documents", authMiddleware, async (req, res) => {
    try {
        const { contractorId } = req.params;
        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        // Ищем контрагента и подтягиваем его документы
        const contractor = await Contractor.findOne({
            _id: contractorId,
            clinicId: clinic._id, // Ограничиваем поиск только для клиники пользователя
        }).populate("documentIds");

        if (!contractor) {
            return res.status(404).json({ message: "Контрагент не найден" });
        }

        res.status(200).json({
            contractor: {
                id: contractor._id,
                firstName: contractor.firstName,
                lastName: contractor.lastName,
                fathersName: contractor.fathersName,
                phoneNumber: contractor.phoneNumber,
            },
            documents: contractor.documentIds.map((doc) => ({
                id: doc._id,
                title: doc.title,
                status: doc.status,
                createdAt: doc.createdAt,
                fileUrl: doc.fileUrl,
            })),
        });
    } catch (error) {
        console.error("Ошибка при получении документов контрагента:", error);
        res.status(500).json({
            message: "Ошибка при получении документов контрагента"
        });
    }
});

module.exports = router;