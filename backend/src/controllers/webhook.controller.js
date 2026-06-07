import { log } from '../utils/logger.js';
import * as webhookService from '../services/webhook.service.js';
import { prisma } from '../lib/prisma.js';
import { publishInboxLive } from '../realtime/publishInbox.js';
import { EventType } from '../realtime/events.js';
import { activateProSubscription } from '../services/subscriptionBilling.service.js';
import { verifyRazorpayWebhookSignature } from '../services/razorpay.service.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';
import { settleAppointmentPaymentFromWebhook } from '../scheduling/appointmentPayment.service.js';

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
        const statuses = value?.statuses || [];
        const contacts = value?.contacts || [];
        const contactName = contacts[0]?.profile?.name;

        if (statuses.length) {
          await webhookService.handleWhatsAppStatuses({
            phoneNumberId: phoneNumberId || undefined,
            statuses,
          });
        }

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

    const notifyCustomerPaymentStatus = async ({ customerPaymentId, status, amount }) => {
      const cp = await prisma.customerPayment.findUnique({
        where: { id: customerPaymentId },
        select: { id: true, customerId: true, businessId: true },
      });
      if (!cp) return;
      const customer = await prisma.customer.findFirst({
        where: { id: cp.customerId, businessId: cp.businessId },
        select: { id: true, phone: true },
      });
      const business = await prisma.business.findUnique({
        where: { id: cp.businessId },
        select: { id: true, phoneNumberId: true },
      });
      if (!customer?.phone || !business?.phoneNumberId) return;

      const body =
        status === 'PAID'
          ? `Payment received successfully: Rs ${Number(amount).toFixed(2)}. Thank you! ✅`
          : `Payment failed for Rs ${Number(amount).toFixed(2)}. You can ask me for a new payment link anytime.`;
      try {
        await sendWhatsAppText({
          phoneNumberId: business.phoneNumberId,
          toPhoneE164: customer.phone,
          body,
        });
        const paymentBotMsg = await prisma.message.create({
          data: {
            customerId: customer.id,
            businessId: cp.businessId,
            type: 'BOT',
            content: body,
          },
        });
        await publishInboxLive({
          businessId: cp.businessId,
          customerId: customer.id,
          type: EventType.MESSAGE_CREATED,
          reason: 'payment_status_bot',
          message: paymentBotMsg,
        });
      } catch (e) {
        log('warn', 'customer_payment_status_notify_failed', {
          customerPaymentId,
          status,
          message: e.message,
        });
      }
    };

    const creditWalletForCustomerPayment = async (customerPayment) => {
      let paidNow = false;
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
        paidNow = true;
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
      return paidNow;
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
          const paidNow = await creditWalletForCustomerPayment({
            ...cp,
            providerPaymentId: paymentId || null,
          });
          if (paidNow) {
            await notifyCustomerPaymentStatus({
              customerPaymentId: cp.id,
              status: 'PAID',
              amount: cp.amount,
            });
          }
        }
      }
      if (orderId && paymentId) {
        const payment = await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
        if (payment && payment.status !== 'SUCCESS' && payment.type === 'WALLET_TOPUP') {
          await prisma.$transaction(async (tx) => {
            const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
            if (!fresh || fresh.status === 'SUCCESS') return;
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
          await activateProSubscription(payment.businessId, payment.id, {
            providerOrderId: orderId,
            providerPaymentId: paymentId,
          });
        }
      }
    }

    if (event === 'payment_link.paid') {
      const link = payload?.payment_link?.entity;
      const paymentEntity = payload?.payment?.entity;
      const linkId = link?.id;
      const notes = link?.notes || paymentEntity?.notes || {};
      if (linkId) {
        if (notes?.kind === 'subscription' && notes?.paymentId && notes?.businessId) {
          await activateProSubscription(String(notes.businessId), String(notes.paymentId), {
            providerLinkId: linkId,
            providerPaymentId: paymentEntity?.id || null,
          });
        }

        if (notes?.kind === 'appointment_payment') {
          await settleAppointmentPaymentFromWebhook({
            providerLinkId: linkId,
            providerPaymentId: paymentEntity?.id || null,
          });
        }

        const cp = await prisma.customerPayment.findFirst({
          where: { providerLinkId: linkId },
        });
        if (cp) {
          await prisma.customerPayment.update({
            where: { id: cp.id },
            data: { providerPaymentId: paymentEntity?.id || null },
          });
          const paidNow = await creditWalletForCustomerPayment({
            ...cp,
            providerPaymentId: paymentEntity?.id || null,
          });
          if (paidNow) {
            await notifyCustomerPaymentStatus({
              customerPaymentId: cp.id,
              status: 'PAID',
              amount: cp.amount,
            });
          }
        }
      }
    }

    if (event === 'payment.failed') {
      const entity = payload?.payment?.entity;
      const orderId = entity?.order_id;
      const notes = entity?.notes || {};
      if (notes?.kind === 'customer_payment' && notes?.customerPaymentId) {
        const cp = await prisma.customerPayment.findFirst({
          where: {
            id: String(notes.customerPaymentId),
            businessId: String(notes.businessId || ''),
          },
        });
        if (cp && cp.status !== 'PAID') {
          await notifyCustomerPaymentStatus({
            customerPaymentId: cp.id,
            status: 'FAILED',
            amount: cp.amount,
          });
        }
      }
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
