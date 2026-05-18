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

function resolveWabaId(explicit) {
  return explicit || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
}

function resolvePhoneNumberId(explicit) {
  return explicit || process.env.PHONE_NUMBER_ID || '';
}

export function formatWhatsAppApiError(e) {
  const err = e?.response?.data?.error;
  if (err?.message) {
    return err.code ? `(${err.code}) ${err.message}` : err.message;
  }
  if (e?.response?.data) return JSON.stringify(e.response.data);
  return e?.message || 'WhatsApp API error';
}

/**
 * Send an approved WhatsApp template message (required outside the 24h session window).
 */
export async function sendWhatsAppTemplate({
  phoneNumberId,
  toPhoneE164,
  templateName,
  languageCode = 'en_US',
  bodyParameters = [],
  headerParameters = [],
}) {
  const pid = resolvePhoneNumberId(phoneNumberId);
  const t = token();
  if (!t || !pid) {
    log('warn', 'whatsapp_template_send_skipped_no_config');
    return { skipped: true };
  }
  if (!templateName) {
    throw new Error('templateName is required for template send');
  }

  const components = [];
  if (headerParameters.length) {
    components.push({
      type: 'header',
      parameters: headerParameters.map((text) => ({
        type: 'text',
        text: String(text ?? ''),
      })),
    });
  }
  if (bodyParameters.length) {
    components.push({
      type: 'body',
      parameters: bodyParameters.map((text) => ({
        type: 'text',
        text: String(text ?? ''),
      })),
    });
  }

  const url = `${GRAPH}/${pid}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: String(toPhoneE164).replace(/^\+/, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
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
    log('error', 'whatsapp_template_failed', {
      templateName,
      to: toPhoneE164,
      message: formatWhatsAppApiError(e),
    });
    throw e;
  }
}

/**
 * Send WhatsApp text message (session messages only — within 24h of last customer message).
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
 * Send WhatsApp image using public URL.
 */
export async function sendWhatsAppImageUrl({ phoneNumberId, toPhoneE164, imageUrl, caption = '' }) {
  const pid = resolvePhoneNumberId(phoneNumberId);
  const t = token();
  if (!t || !pid) {
    log('warn', 'whatsapp_image_url_skipped_no_config');
    return { skipped: true };
  }
  if (!imageUrl) {
    throw new Error('imageUrl is required');
  }
  const url = `${GRAPH}/${pid}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhoneE164.replace(/^\+/, ''),
    type: 'image',
    image: {
      link: imageUrl,
      ...(caption ? { caption } : {}),
    },
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
    log('error', 'whatsapp_image_url_failed', {
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

function toMetaError(e) {
  if (e?.response?.data) return JSON.stringify(e.response.data);
  return e?.message || 'Unknown Meta API error';
}

export async function createWhatsAppTemplate({ wabaId, payload }) {
  const t = token();
  const resolvedWabaId = resolveWabaId(wabaId);
  if (!t || !resolvedWabaId) {
    throw new Error('Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID');
  }

  const url = `${GRAPH}/${resolvedWabaId}/message_templates`;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Meta template payload is required');
  }
  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
    });
    return res.data;
  } catch (e) {
    throw new Error(`Meta template create failed: ${toMetaError(e)}`);
  }
}

export async function updateWhatsAppTemplate({ templateId, payload }) {
  const t = token();
  if (!t || !templateId) {
    throw new Error('Missing WHATSAPP_ACCESS_TOKEN or template id');
  }
  const url = `${GRAPH}/${String(templateId).trim()}`;
  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
    });
    return res.data;
  } catch (e) {
    throw new Error(`Meta template update failed: ${toMetaError(e)}`);
  }
}

export async function listWhatsAppTemplates({ wabaId, limit = 200 } = {}) {
  const t = token();
  const resolvedWabaId = resolveWabaId(wabaId);
  if (!t || !resolvedWabaId) {
    throw new Error('Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID');
  }

  const all = [];
  let url = `${GRAPH}/${resolvedWabaId}/message_templates?limit=${Math.min(Math.max(limit, 1), 200)}`;
  while (url) {
    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
      });
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      all.push(...rows);
      url = res.data?.paging?.next || null;
    } catch (e) {
      throw new Error(`Meta template list failed: ${toMetaError(e)}`);
    }
  }
  return all;
}
