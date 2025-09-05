const Minio = require('minio');
require('dotenv').config();

// MinIO client configuration
const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: process.env.AWS_ACCESS_KEY_ID,
  secretKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Ensure bucket exists
const ensureBucketExists = async () => {
  try {
    const bucketName = process.env.AWS_S3_BUCKET;
    const exists = await minioClient.bucketExists(bucketName);
    
    if (!exists) {
      console.log(`Creating bucket: ${bucketName}`);
      await minioClient.makeBucket(bucketName, process.env.AWS_S3_REGION);
      console.log(`✅ Bucket '${bucketName}' created successfully`);
    } else {
      console.log(`✅ Bucket '${bucketName}' already exists`);
    }
  } catch (err) {
    console.error('Error ensuring bucket exists:', err);
  }
};

// Initialize MinIO connection
const initMinio = async () => {
  try {
    await ensureBucketExists();
    console.log('✅ MinIO client initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing MinIO:', err);
  }
};

module.exports = {
  minioClient,
  initMinio,
  ensureBucketExists
};
