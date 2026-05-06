import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'wapilot-media';

let cached = null;

function getClient() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

function extensionFromMime(mimeType) {
  if (!mimeType) return 'bin';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'application/pdf') return 'pdf';
  return mimeType.split('/')[1] || 'bin';
}

function hasExtension(name = '') {
  return /\.[a-zA-Z0-9]{2,8}$/.test(name.trim());
}

export async function ensureBucketExists(bucket = DEFAULT_BUCKET) {
  const client = getClient();
  const { data, error } = await client.storage.listBuckets();
  if (error) throw new Error(`Supabase listBuckets failed: ${error.message}`);
  const exists = (data || []).some((b) => b.name === bucket);
  if (exists) return bucket;

  const { error: createErr } = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: '20MB',
  });
  if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
    throw new Error(`Supabase createBucket failed: ${createErr.message}`);
  }
  return bucket;
}

export async function uploadBase64ToSupabase({
  base64Data,
  mimeType,
  fileName,
  bucket = DEFAULT_BUCKET,
  businessId,
}) {
  const client = getClient();
  await ensureBucketExists(bucket);

  const clean = String(base64Data || '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!clean) throw new Error('base64Data is required');
  const bytes = Buffer.from(clean, 'base64');
  const ext = extensionFromMime(mimeType);
  const baseName = fileName || `upload-${Date.now()}.${ext}`;
  const withExt = hasExtension(baseName) ? baseName : `${baseName}.${ext}`;
  const safeName = withExt.replace(/[^\w.\-]/g, '_');
  const path = `${businessId || 'common'}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await client.storage.from(bucket).upload(path, bytes, {
    contentType: mimeType || 'application/octet-stream',
    upsert: false,
  });
  if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`);

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  const publicUrl = data?.publicUrl || '';
  if (!/\.[a-zA-Z0-9]{2,8}($|\?)/.test(publicUrl)) {
    throw new Error('Supabase public URL does not include a file extension');
  }
  return {
    bucket,
    path,
    publicUrl,
  };
}
