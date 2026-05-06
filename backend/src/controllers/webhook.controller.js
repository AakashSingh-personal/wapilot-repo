import { log } from '../utils/logger.js';
import * as webhookService from '../services/webhook.service.js';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.VERIFY_TOKEN;

  if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
    log('info', 'webhook_verified');
    return res.status(200).send(challenge);
  }
  log('warn', 'webhook_verify_failed');
  return res.sendStatus(403);
}

export async function receiveWebhook(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        const rawPid = value?.metadata?.phone_number_id;
        const phoneNumberId =
          rawPid !== undefined && rawPid !== null ? String(rawPid).trim() : '';
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];
        const contactName = contacts[0]?.profile?.name;

        for (const msg of messages) {
          const from = msg.from;
          if (!from) continue;

          if (msg.type === 'text') {
            const textBody = msg.text?.body;
            if (!textBody) continue;
            await webhookService.handleInboundText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              textBody,
              contactName,
            });
            continue;
          }

          if (msg.type === 'image') {
            await webhookService.handleInboundImage({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              mediaId: msg.image?.id,
              caption: msg.image?.caption,
              mimeType: msg.image?.mime_type,
              contactName,
            });
            continue;
          }

          if (msg.type === 'audio') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'audio',
              msgPayload: msg.audio,
              contactName,
            });
            continue;
          }

          if (msg.type === 'video') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'video',
              msgPayload: msg.video,
              contactName,
            });
            continue;
          }

          if (msg.type === 'document') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'document',
              msgPayload: msg.document,
              contactName,
            });
            continue;
          }

          if (msg.type === 'sticker') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'sticker',
              msgPayload: msg.sticker,
              contactName,
            });
            continue;
          }

          if (msg.type === 'location') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'location',
              msgPayload: msg.location,
              contactName,
            });
            continue;
          }

          if (msg.type === 'contacts') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'contacts',
              msgPayload: msg.contacts,
              contactName,
            });
            continue;
          }

          if (msg.type === 'button') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'button',
              msgPayload: msg.button,
              contactName,
            });
            continue;
          }

          if (msg.type === 'interactive') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'interactive',
              msgPayload: msg.interactive,
              contactName,
            });
            continue;
          }

          if (msg.type === 'reaction') {
            await webhookService.handleInboundNonText({
              phoneNumberId: phoneNumberId || undefined,
              fromWaId: from,
              msgType: 'reaction',
              msgPayload: msg.reaction,
              contactName,
            });
            continue;
          }

          await webhookService.handleInboundNonText({
            phoneNumberId: phoneNumberId || undefined,
            fromWaId: from,
            msgType: msg.type || 'unknown',
            msgPayload: msg[msg.type] || msg,
            contactName,
          });
        }
      }
    }
  } catch (e) {
    log('error', 'webhook_process_error', { message: e.message });
  }
}
