const mongoose = require("mongoose");

const ContractorSchema = new mongoose.Schema({
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: "Clinic", required: true, index: true }, // Клиника, отправившая документы
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    fathersName: { type: String, required: false },
    phoneNumber: { type: String, required: true, index: true }, // НЕ уникальное поле, т.к. один человек может быть контрагентом у разных клиник
    documentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }] // Ссылки на документы
}, { timestamps: true });

module.exports = mongoose.model("Contractor", ContractorSchema);
