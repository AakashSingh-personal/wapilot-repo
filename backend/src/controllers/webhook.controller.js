import { log } from '../utils/logger.js';
import * as webhookService from '../services/webhook.service.js';
import { prisma } from '../lib/prisma.js';
import { verifyRazorpayWebhookSignature } from '../services/razorpay.service.js';

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

export async function receiveRazorpayWebhook(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const valid = verifyRazorpayWebhookSignature({
      rawBody: raw,
      signature: String(signature || ''),
    });
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature' });

    const event = req.body?.event || '';
    const payload = req.body?.payload || {};

    const creditWalletForCustomerPayment = async (customerPayment) => {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.customerPayment.findUnique({ where: { id: customerPayment.id } });
        if (!fresh || fresh.status === 'PAID') return;
        await tx.customerPayment.update({
          where: { id: customerPayment.id },
          data: {
            status: 'PAID',
            provider: 'RAZORPAY',
            providerPaymentId: customerPayment.providerPaymentId || undefined,
          },
        });
        const wallet = await tx.wallet.upsert({
          where: { businessId: customerPayment.businessId },
          update: {},
          create: {
            businessId: customerPayment.businessId,
            balance: '0',
          },
        });
        const nextBalance = (Number(wallet.balance) + Number(customerPayment.amount)).toFixed(2);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: nextBalance },
        });
        await tx.walletTransaction.create({
          data: {
            businessId: customerPayment.businessId,
            amount: customerPayment.amount,
            type: 'CREDIT',
            description: `Customer payment received (${customerPayment.id})`,
          },
        });
      });
    };

    if (event === 'payment.captured') {
      const entity = payload?.payment?.entity;
      const orderId = entity?.order_id;
      const paymentId = entity?.id;
      const notes = entity?.notes || {};
      if (notes?.kind === 'customer_payment' && notes?.customerPaymentId) {
        const cp = await prisma.customerPayment.findFirst({
          where: {
            id: String(notes.customerPaymentId),
            businessId: String(notes.businessId || ''),
          },
        });
        if (cp) {
          await prisma.customerPayment.update({
            where: { id: cp.id },
            data: { providerPaymentId: paymentId || null },
          });
          await creditWalletForCustomerPayment({
            ...cp,
            providerPaymentId: paymentId || null,
          });
        }
      }
      if (orderId && paymentId) {
        const payment = await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
        if (payment && payment.status !== 'SUCCESS' && payment.type === 'WALLET_TOPUP') {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'SUCCESS',
                provider: 'RAZORPAY',
                providerPaymentId: paymentId,
              },
            });
            const wallet = await tx.wallet.upsert({
              where: { businessId: payment.businessId },
              update: {},
              create: {
                businessId: payment.businessId,
                balance: '0',
              },
            });
            const nextBalance = (Number(wallet.balance) + Number(payment.amount)).toFixed(2);
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: nextBalance },
            });
            await tx.walletTransaction.create({
              data: {
                businessId: payment.businessId,
                amount: payment.amount,
                type: 'CREDIT',
                description: `Wallet top-up captured (${payment.id})`,
              },
            });
          });
        }
        if (payment && payment.status !== 'SUCCESS' && payment.type === 'SUBSCRIPTION') {
          const expires = new Date();
          expires.setMonth(expires.getMonth() + 1);
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'SUCCESS',
                provider: 'RAZORPAY',
                providerPaymentId: paymentId,
              },
            });
            await tx.subscription.updateMany({
              where: { businessId: payment.businessId },
              data: { status: 'EXPIRED' },
            });
            await tx.subscription.create({
              data: {
                businessId: payment.businessId,
                plan: 'PRO',
                status: 'ACTIVE',
                amount: payment.amount,
                expiresAt: expires,
              },
            });
          });
        }
      }
    }

    if (event === 'payment_link.paid') {
      const link = payload?.payment_link?.entity;
      const paymentEntity = payload?.payment?.entity;
      const linkId = link?.id;
      if (linkId) {
        const cp = await prisma.customerPayment.findFirst({
          where: { providerLinkId: linkId },
        });
        if (cp) {
          await prisma.customerPayment.update({
            where: { id: cp.id },
            data: { providerPaymentId: paymentEntity?.id || null },
          });
          await creditWalletForCustomerPayment({
            ...cp,
            providerPaymentId: paymentEntity?.id || null,
          });
        }
      }
    }

    if (event === 'payment.failed') {
      const entity = payload?.payment?.entity;
      const orderId = entity?.order_id;
      if (orderId) {
        await prisma.payment.updateMany({
          where: { providerOrderId: orderId },
          data: { status: 'FAILED', provider: 'RAZORPAY' },
        });
      }
    }

    res.json({ ok: true });
  } catch (e) {
    log('error', 'razorpay_webhook_error', { message: e.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
