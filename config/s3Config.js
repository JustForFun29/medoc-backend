const AWS = require("aws-sdk");

console.log("Access Key ID:", process.env.CLOUD_ACCESS_KEY_ID);
console.log("Secret Access Key:", process.env.CLOUD_SECRET_ACCESS_KEY);

// Настройка S3
const s3 = new AWS.S3({
  endpoint: process.env.CLOUD_S3_ENDPOINT, // https://s3.cloud.ru
  region: process.env.CLOUD_REGION, // ru-central-1
  accessKeyId: process.env.CLOUD_ACCESS_KEY_ID, // Ваш Access Key ID
  secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY, // Ваш Secret Access Key
  s3ForcePathStyle: true, // Использование пути вместо домена
  customUserAgent: `tenant-id=${process.env.TENANT_ID}`, // Включаем Tenant ID
});

module.exports = s3;
