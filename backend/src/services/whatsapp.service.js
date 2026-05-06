import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { log } from '../utils/logger.js';

const GRAPH = 'https://graph.facebook.com/v18.0';

function token() {
  return process.env.WHATSAPP_ACCESS_TOKEN || '';
}

function resolvePhoneNumberId(explicit) {
  return explicit || process.env.PHONE_NUMBER_ID || '';
}

/**
 * Send WhatsApp text message.
 */
export async function sendWhatsAppText({ phoneNumberId, toPhoneE164, body }) {
  const pid = resolvePhoneNumberId(phoneNumberId);
  const t = token();
  if (!t || !pid) {
    log('warn', 'whatsapp_send_skipped_no_config');
    return { skipped: true };
  }
  const url = `${GRAPH}/${pid}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhoneE164.replace(/^\+/, ''),
    type: 'text',
    text: { preview_url: false, body },
  };
  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
    });
    return res.data;
  } catch (e) {
    log('error', 'whatsapp_text_failed', {
      message: e.response?.data ? JSON.stringify(e.response.data) : e.message,
    });
    throw e;
  }
}

/**
 * Upload media then send image by id (QR PNG).
 */
export async function sendWhatsAppImageFromBuffer({ phoneNumberId, toPhoneE164, buffer, mimeType = 'image/png' }) {
  const pid = resolvePhoneNumberId(phoneNumberId);
  const t = token();
  if (!t || !pid) {
    log('warn', 'whatsapp_image_skipped_no_config');
    return { skipped: true };
  }

  const tmp = path.join(os.tmpdir(), `wapilot-${Date.now()}.png`);
  fs.writeFileSync(tmp, buffer);

  try {
    const sessionUrl = `${GRAPH}/${pid}/media`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fs.createReadStream(tmp), { filename: 'qr.png', contentType: mimeType });
    form.append('type', mimeType);

    const upload = await axios.post(sessionUrl, form, {
      headers: {
        Authorization: `Bearer ${t}`,
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const mediaId = upload.data?.id;
    if (!mediaId) throw new Error('No media id from WhatsApp upload');

    const msgUrl = `${GRAPH}/${pid}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: toPhoneE164.replace(/^\+/, ''),
      type: 'image',
      image: { id: mediaId },
    };
    const sent = await axios.post(msgUrl, payload, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
    });
    return sent.data;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetch media bytes for an inbound WhatsApp media id.
 */
export async function fetchWhatsAppMediaById(mediaId) {
  const t = token();
  if (!t || !mediaId) {
    throw new Error('Missing WhatsApp token or media id');
  }

  const metaUrl = `${GRAPH}/${mediaId}`;
  const meta = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${t}` },
  });

  const downloadUrl = meta.data?.url;
  if (!downloadUrl) {
    throw new Error('WhatsApp media url missing');
  }

  const fileRes = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${t}` },
    responseType: 'arraybuffer',
  });

  return {
    buffer: Buffer.from(fileRes.data),
    mimeType: meta.data?.mime_type || fileRes.headers['content-type'] || 'application/octet-stream',
  };
}
