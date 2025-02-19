// cronJobs.js
const cron = require("node-cron");
const {
    CopyObjectCommand,
    DeleteObjectCommand,
    S3Client
} = require("@aws-sdk/client-s3");
const Document = require("../models/Document");

// Подключение к S3
const s3Client = new S3Client({
    region: "ru-central-1",
    endpoint: "https://s3.cloud.ru",
    credentials: {
        accessKeyId: process.env.CLOUD_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

// Имена бакетов для разных классов хранения
const STANDARD_BUCKET = "docuflow-storage";
const COLD_BUCKET = "docuflow-storage-cold";
const ICE_BUCKET = "docuflow-storage-ice";

/**
 * Функция для копирования объекта между бакетами
 * (сохранение того же objectKey).
 */
async function moveObjectBetweenBuckets({ sourceBucket, targetBucket, objectKey }) {
    // 1) Copy
    await s3Client.send(
        new CopyObjectCommand({
            CopySource: encodeURI(`${sourceBucket}/${objectKey}`), // "sourceBucket/objectKey"
            Bucket: targetBucket,
            Key: objectKey,
        })
    );

    // 2) Delete
    await s3Client.send(
        new DeleteObjectCommand({
            Bucket: sourceBucket,
            Key: objectKey,
        })
    );
}

// Запускаем cron задачу каждый день в 03:00
cron.schedule("0 3 * * *", async () => {
    console.log("Cron start: проверка lastAccessed для документов...");
    const now = new Date();
    // 7 дней назад
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    // 30 дней назад
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    try {
        // 1) Ищем документы, которые не запрашивались >7 дней и всё ещё в STANDARD
        const docsStandardToCold = await Document.find({
            storageClass: "STANDARD",
            lastAccessed: { $lt: sevenDaysAgo },
        });

        for (const doc of docsStandardToCold) {
            console.log(`Переводим документ ${doc._id} в COLD storage...`);

            await moveObjectBetweenBuckets({
                sourceBucket: doc.bucket,       // Ожидается "docuflow-storage"
                targetBucket: COLD_BUCKET,      // => "docuflow-storage-cold"
                objectKey: doc.objectKey,
            });

            doc.bucket = COLD_BUCKET;
            doc.storageClass = "COLD";
            await doc.save();
        }

        // 2) Ищем документы, которые не запрашивались >30 дней, но ещё не в ICE
        const docsToIce = await Document.find({
            storageClass: { $in: ["STANDARD", "COLD"] },
            lastAccessed: { $lt: thirtyDaysAgo },
        });

        for (const doc of docsToIce) {
            console.log(`Переводим документ ${doc._id} в ICE storage...`);

            await moveObjectBetweenBuckets({
                sourceBucket: doc.bucket,
                targetBucket: ICE_BUCKET,
                objectKey: doc.objectKey,
            });

            doc.bucket = ICE_BUCKET;
            doc.storageClass = "ICE";
            await doc.save();
        }

        console.log("Cron finished: документы обработаны.");
    } catch (error) {
        console.error("Ошибка в cron-задаче:", error);
    }
});
