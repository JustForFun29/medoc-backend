// controllers/fileController.js
const path = require("path");
const fs = require("fs/promises");
const { randomUUID } = require("crypto");
const libre = require("libreoffice-convert");
const { execFile } = require("child_process");
const File = require("../models/File");
const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

// ======= ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ =======
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

const s3Client = new S3Client({
    region: "ru-central-1",
    endpoint: "https://s3.cloud.ru",
    credentials: {
        accessKeyId: process.env.CLOUD_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

const BUCKET_NAME = "docuflow-storage";
const FOLDER_NAME = "files/";

exports.getFiles = async (req, res) => {
    try {
        // Получаем файлы, созданные пользователем или публичные
        const files = await File.find({
            $or: [{ createdBy: req.user.id }, { isPublic: true }],
        }).select("fileName documentTitle createdBy isPublic createdAt");

        res.status(200).json({ files });
    } catch (error) {
        console.error("Ошибка при получении файлов:", error);
        res.status(500).json({ message: "Ошибка при получении файлов" });
    }
};



// Загрузка файла + генерация PDF/PNG превью (под pdf2pic v3)

const LOCAL_TMP_DIR = path.join(__dirname, "../tmp"); // Гарантированно правильный путь на всех системах

exports.uploadFile = async (req, res) => {
    const uniqueFileName = `${Date.now()}-${randomUUID()}`;
    const tmpPdfPath = path.join(LOCAL_TMP_DIR, `${uniqueFileName}.pdf`);
    const generatedPngPath = path.join(LOCAL_TMP_DIR, `preview-png-${uniqueFileName}.png`);

    try {
        const { isPublic, documentTitle } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "Файл отсутствует в запросе" });
        }

        await fs.mkdir(LOCAL_TMP_DIR, { recursive: true });

        const s3Key = `${FOLDER_NAME}${uniqueFileName}`;

        // Загрузка исходного файла в S3
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        }));

        const newFile = new File({
            fileName: uniqueFileName,
            documentTitle,
            createdBy: req.user.id,
            isPublic: isPublic === "true",
        });

        // Конвертация в PDF (если нужно)
        let pdfBuffer = req.file.buffer;
        if (!documentTitle.toLowerCase().endsWith(".pdf")) {
            pdfBuffer = await new Promise((resolve, reject) => {
                libre.convert(req.file.buffer, ".pdf", undefined, (err, done) => {
                    if (err) reject(err);
                    else resolve(done);
                });
            });
        }

        // PDF в S3
        const pdfKey = `files/preview-pdf-${uniqueFileName}.pdf`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: pdfKey,
            Body: pdfBuffer,
            ContentType: "application/pdf",
        }));
        newFile.previewPdfKey = pdfKey;

        // Сохраняем PDF временно
        await fs.writeFile(tmpPdfPath, pdfBuffer);

        // Генерируем PNG (Poppler)
        const popplerBin = process.platform === "win32"
            ? "C:\\Program Files\\Poppler\\poppler-24.08.0\\Library\\bin\\pdftoppm.exe"
            : "pdftoppm";

        await new Promise((resolve, reject) => {
            execFile(popplerBin, ["-png", "-f", "1", "-singlefile", tmpPdfPath, generatedPngPath.replace(/\.png$/, '')],
                (error) => {
                    if (error) reject(error);
                    else resolve();
                });
        });

        // PNG в S3
        const pngBuffer = await fs.readFile(generatedPngPath);
        const pngKey = `files/preview-png-${uniqueFileName}.png`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: pngKey,
            Body: pngBuffer,
            ContentType: "image/png",
        }));
        newFile.previewPngKey = pngKey;

        await newFile.save();

        res.status(201).json({
            message: "Файл успешно загружен и обработан",
            file: newFile,
        });

    } catch (error) {
        console.error("Ошибка при загрузке файла:", error);
        res.status(500).json({ message: "Ошибка при загрузке файла" });
    } finally {
        // Гарантированное удаление временных файлов
        await Promise.all([
            fs.unlink(tmpPdfPath).catch(() => null),
            fs.unlink(generatedPngPath).catch(() => null)
        ]);
    }
};


exports.deleteFile = async (req, res) => {
    const { id } = req.params;
    try {
        const file = await File.findById(id);
        if (!file) {
            return res.status(404).json({ message: "Файл не найден" });
        }
        if (!file.createdBy.equals(req.user.id)) {
            return res
                .status(403)
                .json({ message: "У вас нет прав на удаление этого файла" });
        }

        // Удаляем исходный объект из S3
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: `files/${file.fileName}`,
            })
        );

        // Удаляем previewPdfKey, если есть
        if (file.previewPdfKey) {
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: file.previewPdfKey,
                })
            );
        }

        // Удаляем previewPngKey, если есть
        if (file.previewPngKey) {
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: file.previewPngKey,
                })
            );
        }

        await File.deleteOne({ _id: id });

        res.status(200).json({ message: "Файл успешно удалён" });
    } catch (error) {
        console.error("Ошибка при удалении файла:", error);
        res.status(500).json({ message: "Ошибка при удалении файла" });
    }
};

// Пример getPdfPreview: возвращаем base64 PDF, который хранится по previewPdfKey:
exports.getPdfPreview = async (req, res) => {
    try {
        const { id } = req.params;
        const fileDoc = await File.findById(id);
        if (!fileDoc) {
            return res.status(404).json({ message: "Файл не найден" });
        }

        // Проверяем доступ
        if (!fileDoc.isPublic && !fileDoc.createdBy.equals(req.user.id)) {
            return res.status(403).json({ message: "Нет доступа к файлу" });
        }

        if (!fileDoc.previewPdfKey) {
            return res.status(400).json({ message: "У файла нет PDF-превью" });
        }

        // Скачиваем
        const data = await s3Client.send(
            new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileDoc.previewPdfKey,
            })
        );
        const pdfBuffer = await streamToBuffer(data.Body);
        const pdfBase64 = pdfBuffer.toString("base64");

        return res.json({
            success: true,
            fileId: fileDoc._id,
            pdfBase64,
        });
    } catch (error) {
        console.error("Ошибка при получении PDF-превью:", error);
        res.status(500).json({ message: "Не удалось получить PDF-превью" });
    }
};

exports.getPngPreview = async (req, res) => {
    try {
        const { id } = req.params;
        const fileDoc = await File.findById(id);
        if (!fileDoc) {
            return res.status(404).json({ message: "Файл не найден" });
        }

        // Проверяем доступ
        if (!fileDoc.isPublic && !fileDoc.createdBy.equals(req.user.id)) {
            return res.status(403).json({ message: "Нет доступа к файлу" });
        }

        if (!fileDoc.previewPngKey) {
            return res.status(400).json({ message: "У файла нет PNG-превью" });
        }

        const data = await s3Client.send(
            new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileDoc.previewPngKey,
            })
        );

        res.setHeader("Content-Type", "image/png");
        data.Body.pipe(res);

    } catch (error) {
        console.error("Ошибка при получении PNG-превью:", error);
        res.status(500).json({ message: "Не удалось получить PNG-превью" });
    }
};

