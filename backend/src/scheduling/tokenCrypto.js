import crypto from 'crypto';

function key() {
  const raw = process.env.CALENDAR_TOKEN_SECRET || process.env.JWT_SECRET || '';
  if (!raw) throw new Error('CALENDAR_TOKEN_SECRET or JWT_SECRET required for token encryption');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(stored) {
  if (!stored) return null;
  const [ivB, tagB, dataB] = String(stored).split('.');
  if (!ivB || !tagB || !dataB) return stored;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivB, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
