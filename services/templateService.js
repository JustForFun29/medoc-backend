// services/templateService.js
const libre = require("libreoffice-convert");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const s3Client = require("../utils/s3Client");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { streamToBuffer } = require("../utils/fileUtils");

async function generatePdfFromDocxTemplate({ bucket, objectKey, templateData }) {
    const fileData = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    const docxBuffer = await streamToBuffer(fileData.Body);

    const zip = new PizZip(docxBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } });

    doc.render(templateData);

    const filledDocxBuffer = doc.getZip().generate({ type: "nodebuffer" });

    const pdfBuffer = await new Promise((resolve, reject) => {
        libre.convert(filledDocxBuffer, ".pdf", undefined, (err, done) => err ? reject(err) : resolve(done));
    });

    return pdfBuffer;
}

module.exports = { generatePdfFromDocxTemplate };
