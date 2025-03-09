// services/contractorService.js
const Contractor = require("../models/Contractor");

async function addDocumentToContractor(recipientName, recipientPhoneNumber, documentId, clinicId) {
    let contractor = await Contractor.findOne({
        phoneNumber: recipientPhoneNumber,
        clinicId,
    });

    if (!contractor) {
        const [lastName, firstName, fathersName] = recipientName.split(" ");
        contractor = new Contractor({
            firstName: firstName || "",
            lastName: lastName || "",
            fathersName: fathersName || "",
            phoneNumber: recipientPhoneNumber,
            clinicId,
            documentIds: [documentId],
        });

        await contractor.save();
        return;
    }

    await Contractor.findByIdAndUpdate(
        contractor._id,
        { $addToSet: { documentIds: documentId } },
        { new: true }
    );
}

module.exports = { addDocumentToContractor };