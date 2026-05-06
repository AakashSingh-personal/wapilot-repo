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
          if (msg.type !== 'text') continue;
          const textBody = msg.text?.body;
          const from = msg.from;
          if (!textBody || !from) continue;

          await webhookService.handleInboundText({
            phoneNumberId: phoneNumberId || undefined,
            fromWaId: from,
            textBody,
            contactName,
          });
        }
      }
    }
  } catch (e) {
    log('error', 'webhook_process_error', { message: e.message });
  }
}
