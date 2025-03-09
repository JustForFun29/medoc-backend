const Contractor = require("../models/Contractor");
const Clinic = require("../models/Clinic");
const Document = require("../models/Document");

exports.searchContractors = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            recipientName,
            recipientPhoneNumber,
            consentToEDO,
        } = req.query;

        const pageSize = parseInt(limit, 10);
        const pageNumber = parseInt(page, 10);
        const skip = (pageNumber - 1) * pageSize;

        if (![10, 20, 30, 40, 50].includes(pageSize)) {
            return res.status(400).json({ message: "Некорректное значение limit" });
        }

        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        const filters = { "sender.phoneNumber": clinic.phoneNumber };

        if (recipientName) {
            filters["recipient.name"] = { $regex: new RegExp(recipientName, "i") };
        }

        if (recipientPhoneNumber) {
            filters["recipient.phoneNumber"] = { $regex: new RegExp(recipientPhoneNumber, "i") };
        }

        const documents = await Document.find(filters)
            .select("recipient.name recipient.phoneNumber status title")
            .sort({ createdAt: -1 });

        const contractorsMap = new Map();

        documents.forEach((doc) => {
            const phone = doc.recipient.phoneNumber;

            if (!contractorsMap.has(phone)) {
                contractorsMap.set(phone, {
                    recipientName: doc.recipient.name,
                    recipientPhoneNumber: phone,
                    signedDocumentsCount: 0,
                    consentToEDO: false,
                });
            }

            if (doc.status === "Подписан") {
                contractorsMap.get(phone).signedDocumentsCount += 1;
            }

            if (doc.title === "Согласие на ЭДО" && doc.status === "Подписан") {
                contractorsMap.get(phone).consentToEDO = true;
            }
        });

        let contractorsArray = Array.from(contractorsMap.values());

        if (consentToEDO === "true") {
            contractorsArray = contractorsArray.filter((c) => c.consentToEDO === true);
        } else if (consentToEDO === "false") {
            contractorsArray = contractorsArray.filter((c) => c.consentToEDO === false);
        }

        const total = contractorsArray.length;
        const paginatedContractors = contractorsArray.slice(skip, skip + pageSize);

        res.status(200).json({
            contractors: paginatedContractors,
            pagination: {
                total,
                page: pageNumber,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        console.error("Ошибка при получении контрагентов:", error);
        res.status(500).json({ message: "Ошибка при получении контрагентов" });
    }
};


exports.createContractor = async (req, res) => {
    try {
        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        const { firstName, lastName, fathersName, phoneNumber } = req.body;
        if (!firstName || !lastName || !phoneNumber) {
            return res.status(400).json({
                message: "Необходимо передать firstName, lastName и phoneNumber"
            });
        }

        const existingContractor = await Contractor.findOne({
            clinicId: clinic._id,
            phoneNumber,
        });

        if (existingContractor) {
            return res.status(400).json({
                message: "Контрагент с таким номером телефона уже существует",
            });
        }

        const newContractor = new Contractor({
            clinicId: clinic._id,
            firstName,
            lastName,
            fathersName: fathersName || "",
            phoneNumber,
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
};

exports.deleteContractor = async (req, res) => {
    try {
        const { contractorId } = req.params;

        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        const contractor = await Contractor.findOne({
            _id: contractorId,
            clinicId: clinic._id,
        });

        if (!contractor) {
            return res.status(404).json({ message: "Контрагент не найден" });
        }

        if (contractor.documentIds && contractor.documentIds.length > 0) {
            return res.status(400).json({
                message: "Нельзя удалить контрагента, у которого есть связанные документы",
            });
        }

        await Contractor.deleteOne({ _id: contractorId });

        res.status(200).json({ message: "Контрагент успешно удалён" });
    } catch (error) {
        console.error("Ошибка при удалении контрагента:", error);
        res.status(500).json({ message: "Ошибка при удалении контрагента" });
    }
};

exports.getContractorDocuments = async (req, res) => {
    try {
        const { contractorId } = req.params;
        const clinic = await Clinic.findById(req.user.id);
        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        const contractor = await Contractor.findOne({
            _id: contractorId,
            clinicId: clinic._id,
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
        res.status(500).json({ message: "Ошибка при получении документов контрагента" });
    }
};
