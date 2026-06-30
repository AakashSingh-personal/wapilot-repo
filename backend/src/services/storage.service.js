import { randomUUID } from 'crypto';
import { uploadBase64ToSupabase } from './supabase.service.js';

let s3Module = null;

async function loadS3() {
  if (s3Module) return s3Module;
  const [{ S3Client, PutObjectCommand }, { getSignedUrl }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/s3-request-presigner'),
  ]);
  s3Module = {
    s3Client: new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    }),
    PutObjectCommand,
    getSignedUrl,
  };
  return s3Module;
}

export function isS3Configured() {
  return Boolean(process.env.AWS_S3_BUCKET && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE));
}

function staffPhotoKey(businessId, staffId, fileName) {
  const safe = String(fileName || 'photo.jpg').replace(/[^\w.\-]/g, '_');
  return `staff-profiles/${businessId}/${staffId}/${Date.now()}-${safe}`;
}

function publicS3Url(key) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'ap-south-1';
  if (process.env.AWS_S3_PUBLIC_BASE_URL) {
    return `${process.env.AWS_S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function createStaffProfilePresignedUpload({ businessId, staffId, mimeType, fileName }) {
  if (!isS3Configured()) {
    const err = new Error('S3 is not configured — use direct upload endpoint');
    err.statusCode = 501;
    err.code = 'S3_NOT_CONFIGURED';
    throw err;
  }
  const { s3Client, PutObjectCommand, getSignedUrl } = await loadS3();
  const key = staffPhotoKey(businessId, staffId, fileName);
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ContentType: mimeType || 'image/jpeg',
    ACL: process.env.AWS_S3_ACL || 'public-read',
  });
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: Number(process.env.AWS_PRESIGN_TTL_SEC || 300),
  });
  return {
    uploadUrl,
    publicUrl: publicS3Url(key),
    key,
    method: 'PUT',
  };
}

export async function uploadStaffProfileBase64({ businessId, staffId, base64Data, mimeType, fileName }) {
  if (isS3Configured()) {
    const { s3Client, PutObjectCommand } = await loadS3();
    const clean = String(base64Data || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!clean) throw new Error('base64Data is required');
    const bytes = Buffer.from(clean, 'base64');
    const key = staffPhotoKey(businessId, staffId, fileName || `photo-${randomUUID()}.jpg`);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mimeType || 'image/jpeg',
        ACL: process.env.AWS_S3_ACL || 'public-read',
      }),
    );
    return { publicUrl: publicS3Url(key), key, provider: 's3' };
  }

  const uploaded = await uploadBase64ToSupabase({
    base64Data,
    mimeType,
    fileName: fileName || `staff-${staffId}.jpg`,
    businessId,
    bucket: process.env.STAFF_PHOTO_BUCKET || process.env.SUPABASE_MEDIA_BUCKET || 'vartalap-media',
  });
  return { publicUrl: uploaded.publicUrl, key: uploaded.path, provider: 'supabase' };
}
