// utils/s3Client.js
const { S3Client } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
    region: "ru-central-1",
    endpoint: "https://s3.cloud.ru",
    credentials: {
        accessKeyId: process.env.CLOUD_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

module.exports = s3Client;
