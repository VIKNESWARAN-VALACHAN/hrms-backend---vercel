const AWS = require('aws-sdk');
require('dotenv').config();

const AWS_REGION = process.env.AWS_REGION;
const S3_BUCKET = process.env.AWS_BUCKET_NAME;

// Configure AWS S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  signatureVersion: 'v4',
  endpoint: `https://s3.${AWS_REGION}.amazonaws.com`
});

/**
 * Deletes an object from S3
 * @param {string} s3Key - The key of the object to delete
 * @returns {Promise<boolean>} - Returns true if deletion was successful
 * @throws {Error} - Throws an error if deletion fails
 */
async function deleteFromS3(s3Key) {
  try {
    await s3.deleteObject({
      Bucket: S3_BUCKET,
      Key: s3Key
    }).promise();
    return true;
  } catch (error) {
    console.error('Error deleting from S3:', error);
    throw new Error(`Failed to delete object from S3: ${error.message}`);
  }
}

module.exports = {
  deleteFromS3
}; 