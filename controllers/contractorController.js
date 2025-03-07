const Contractor = require("../models/Contractor");
const Clinic = require("../models/Clinic");

exports.searchContractors = async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        const clinic = await Clinic.findById(req.user.id);

        if (!clinic) {
            return res.status(403).json({ message: "Клиника не авторизована" });
        }

        let filter = { clinicId: clinic._id };

        if (phoneNumber) {
            filter.phoneNumber = { $regex: new RegExp(phoneNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) };

        }

        const contractorsQuery = Contractor.find(filter)
            .select("_id firstName lastName fathersName phoneNumber");

        if (phoneNumber) {
            contractorsQuery;
        }

        const contractors = await contractorsQuery;

        res.status(200).json({ contractors });
    } catch (error) {
        console.error("Ошибка при поиске контрагентов:", error);
        res.status(500).json({ message: "Ошибка при поиске контрагентов" });
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
