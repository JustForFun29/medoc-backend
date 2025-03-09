// utils/fileUtils.js
const { GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("./s3Client");

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function moveObjectBetweenBuckets({ sourceBucket, targetBucket, objectKey }) {
    await s3Client.send(new CopyObjectCommand({
        CopySource: encodeURI(`${sourceBucket}/${objectKey}`),
        Bucket: targetBucket,
        Key: objectKey,
    }));

    await s3Client.send(new DeleteObjectCommand({
        Bucket: sourceBucket,
        Key: objectKey,
    }));
}

module.exports = {
    streamToBuffer,
    moveObjectBetweenBuckets
};
