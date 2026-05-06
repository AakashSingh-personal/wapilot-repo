import { prisma } from '../lib/prisma.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';
import { createWhatsAppTemplate, listWhatsAppTemplates } from '../services/whatsapp.service.js';
import { uploadBase64ToSupabase } from '../services/supabase.service.js';
import {
  createRazorpayOrder,
  razorpayPublicConfig,
  verifyRazorpayPaymentSignature,
} from '../services/razorpay.service.js';

const MESSAGE_COST_INR = Number(process.env.COMMUNICATION_COST_PER_MESSAGE || 2);

function normalizePhone(raw) {
  if (!raw) return '';
  const only = String(raw).trim().replace(/[^\d+]/g, '');
  if (only.startsWith('+')) return only;
  return `+${only}`;
}

function fillTemplate(template, variables = {}) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = variables[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function toMetaTemplateName(name, businessId) {
  const ns = String(businessId || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toLowerCase();
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 480);
  return `${ns}_${base}`.replace(/^_+|_+$/g, '').slice(0, 512);
}

function toMetaTemplateBody(content) {
  const keys = [];
  const replaced = content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const idx = keys.push(key);
    return `{{${idx}}}`;
  });
  return replaced;
}

function mapMetaStatusToLocal(metaStatus) {
  return metaStatus === 'APPROVED' ? 'WORKING' : 'NOT_WORKING';
}

function extractBodyTextFromComponents(components = []) {
  const body = (Array.isArray(components) ? components : []).find((c) => c?.type === 'BODY');
  return typeof body?.text === 'string' ? body.text : '';
}

const META_TEMPLATE_OPTIONS = {
  categories: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
  languages: [
    'en_US',
    'en_GB',
    'hi',
    'ar',
    'es',
    'pt_BR',
    'fr',
    'de',
    'id',
    'it',
  ],
  componentTypes: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'],
  headerFormats: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'],
  buttonTypes: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'OTP'],
};

async function syncTemplateStatusesFromMeta(businessId) {
  const metaTemplates = await listWhatsAppTemplates();
  const byName = new Map(metaTemplates.map((t) => [t.name, t]));
  const local = await prisma.template.findMany({
    where: { businessId },
    select: { id: true, name: true, status: true },
  });

  const updates = [];
  for (const t of local) {
    const metaName = toMetaTemplateName(t.name, businessId);
    const meta = byName.get(metaName);
    if (!meta?.status) continue;
    const nextStatus = mapMetaStatusToLocal(meta.status);
    if (nextStatus !== t.status) {
      updates.push(
        prisma.template.update({
          where: { id: t.id },
          data: { status: nextStatus },
        }),
      );
    }
  }
  if (updates.length) await prisma.$transaction(updates);
}

async function getOrCreateWallet(tx, businessId) {
  const found = await tx.wallet.findUnique({ where: { businessId } });
  if (found) return found;
  return tx.wallet.create({
    data: {
      businessId,
      balance: '0',
    },
  });
}

export async function getWallet(req, res, next) {
  try {
    const wallet = await prisma.wallet.upsert({
      where: { businessId: req.user.businessId },
      update: {},
      create: { businessId: req.user.businessId, balance: '0' },
    });
    res.json({ wallet, messageCost: MESSAGE_COST_INR });
  } catch (e) {
    next(e);
  }
}

export async function listWalletTransactions(req, res, next) {
  try {
    const type = req.query?.type;
    const source = req.query?.source;
    const rawLimit = Number(req.query?.limit);
    const rawOffset = Number(req.query?.offset);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const where = { businessId: req.user.businessId };
    if (type === 'CREDIT' || type === 'DEBIT') where.type = type;
    if (source === 'TOPUP') {
      where.description = { contains: 'Wallet top-up' };
    }

    const rows = await prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
    res.json({
      rows,
      hasMore: rows.length === limit,
      nextOffset: offset + rows.length,
    });
  } catch (e) {
    next(e);
  }
}

export async function addMoneyToWallet(req, res, next) {
  try {
    const amountNum = Number(req.body?.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    const amount = amountNum.toFixed(2);
    const payment = await prisma.payment.create({
      data: {
        businessId: req.user.businessId,
        amount,
        type: 'WALLET_TOPUP',
        status: 'PENDING',
        provider: 'RAZORPAY',
      },
    });
    const order = await createRazorpayOrder({
      amountInInr: amountNum,
      receipt: payment.id,
      notes: {
        kind: 'wallet_topup',
        paymentId: payment.id,
        businessId: req.user.businessId,
      },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerOrderId: order.id },
    });

    res.status(201).json({
      paymentId: payment.id,
      orderId: order.id,
      amount: amountNum,
      currency: order.currency || 'INR',
      keyId: razorpayPublicConfig().keyId,
    });
  } catch (e) {
    next(e);
  }
}

export async function verifyWalletTopup(req, res, next) {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        businessId: req.user.businessId,
        type: 'WALLET_TOPUP',
      },
    });
    if (!payment) return res.status(404).json({ error: 'Wallet top-up payment not found' });
    if (payment.status === 'SUCCESS') {
      const wallet = await prisma.wallet.findUnique({ where: { businessId: req.user.businessId } });
      return res.json({ ok: true, wallet });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay verification fields' });
    }
    const valid = verifyRazorpayPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) return res.status(400).json({ error: 'Invalid Razorpay signature' });

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!fresh || fresh.status === 'SUCCESS') return;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          providerOrderId: razorpay_order_id,
          providerPaymentId: razorpay_payment_id,
          providerSignature: razorpay_signature,
          provider: 'RAZORPAY',
        },
      });
      const wallet = await getOrCreateWallet(tx, req.user.businessId);
      const nextBalance = (Number(wallet.balance) + Number(payment.amount)).toFixed(2);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: nextBalance },
      });
      await tx.walletTransaction.create({
        data: {
          businessId: req.user.businessId,
          amount: payment.amount,
          type: 'CREDIT',
          description: `Wallet top-up (${payment.id})`,
        },
      });
    });

    const wallet = await prisma.wallet.findUnique({ where: { businessId: req.user.businessId } });
    res.json({ ok: true, wallet });
  } catch (e) {
    next(e);
  }
}

export async function listContacts(req, res, next) {
  try {
    const contacts = await prisma.contact.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(contacts);
  } catch (e) {
    next(e);
  }
}

export async function uploadContacts(req, res, next) {
  try {
    const { contacts = [], csvText = '' } = req.body || {};
    const lines = typeof csvText === 'string' ? csvText.split('\n') : [];
    const fromCsv = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, phone] = line.split(',').map((v) => (v || '').trim());
        if (!phone) return { name: '', phone: name };
        return { name, phone };
      });

    const merged = [...(Array.isArray(contacts) ? contacts : []), ...fromCsv]
      .map((c) => ({
        name: c?.name?.trim() || null,
        phone: normalizePhone(c?.phone),
      }))
      .filter((c) => c.phone.length >= 10);

    if (!merged.length) {
      return res.status(400).json({ error: 'No valid contacts found in payload' });
    }

    const rows = merged.map((c) => ({
      businessId: req.user.businessId,
      name: c.name,
      phone: c.phone,
    }));

    const created = await prisma.contact.createMany({
      data: rows,
      skipDuplicates: true,
    });
    res.status(201).json({ inserted: created.count });
  } catch (e) {
    next(e);
  }
}

export async function listTemplates(req, res, next) {
  try {
    try {
      await syncTemplateStatusesFromMeta(req.user.businessId);
    } catch {
      // Keep local templates usable even when Meta status sync fails.
    }
    const templates = await prisma.template.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (e) {
    next(e);
  }
}

export async function metaTemplateOptions(_req, res) {
  res.json(META_TEMPLATE_OPTIONS);
}

export async function uploadMedia(req, res, next) {
  try {
    const { base64Data, mimeType, fileName, bucket } = req.body || {};
    if (!base64Data) {
      return res.status(400).json({ error: 'base64Data is required' });
    }
    const uploaded = await uploadBase64ToSupabase({
      base64Data,
      mimeType,
      fileName,
      bucket,
      businessId: req.user.businessId,
    });
    res.status(201).json(uploaded);
  } catch (e) {
    next(e);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const name = req.body?.name?.trim();
    const content = req.body?.content?.trim();
    const category = req.body?.category || 'MARKETING';
    const language = req.body?.language || 'en_US';
    const metaPayload = req.body?.metaPayload && typeof req.body.metaPayload === 'object' ? req.body.metaPayload : null;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const metaName = toMetaTemplateName(name, req.user.businessId);
    if (!metaName) {
      return res.status(400).json({ error: 'Template name is invalid for Meta' });
    }

    const payload = metaPayload
      ? {
          ...metaPayload,
          name: metaName,
          category: metaPayload.category || category,
          language: metaPayload.language || language,
        }
      : {
          name: metaName,
          category,
          language,
          components: [
            {
              type: 'BODY',
              text: toMetaTemplateBody(content || ''),
            },
          ],
        };

    const localContent = content || extractBodyTextFromComponents(payload.components || []);
    if (!localContent) {
      return res.status(400).json({ error: 'content or BODY component text is required' });
    }

    const createdMeta = await createWhatsAppTemplate({
      payload,
    });
    const template = await prisma.template.create({
      data: {
        businessId: req.user.businessId,
        name,
        content: localContent,
        status: mapMetaStatusToLocal(createdMeta?.status),
      },
    });
    res.status(201).json({ template, meta: createdMeta });
  } catch (e) {
    next(e);
  }
}

export async function updateTemplateStatus(req, res, next) {
  try {
    const template = await prisma.template.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const metaName = toMetaTemplateName(template.name, req.user.businessId);
    const metaTemplates = await listWhatsAppTemplates();
    const meta = metaTemplates.find((t) => t.name === metaName);
    if (!meta?.status) {
      return res.status(404).json({ error: 'Template not found on Meta' });
    }
    const updated = await prisma.template.update({
      where: { id: template.id },
      data: { status: mapMetaStatusToLocal(meta.status) },
    });
    res.json({ template: updated, metaStatus: meta.status });
  } catch (e) {
    next(e);
  }
}

export async function sendTemplateCommunication(req, res, next) {
  try {
    const { templateId, contactId, contactIds = [], variables = {} } = req.body || {};
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    const template = await prisma.template.findFirst({
      where: { id: templateId, businessId: req.user.businessId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (template.status !== 'WORKING') {
      return res.status(400).json({ error: 'Template is marked as NOT_WORKING' });
    }

    const ids = [...new Set([contactId, ...contactIds].filter(Boolean))];
    if (!ids.length) {
      return res.status(400).json({ error: 'Provide at least one contactId' });
    }

    const contacts = await prisma.contact.findMany({
      where: { businessId: req.user.businessId, id: { in: ids } },
      orderBy: { createdAt: 'asc' },
    });
    if (!contacts.length) return res.status(404).json({ error: 'No contacts found' });

    const business = await prisma.business.findUnique({ where: { id: req.user.businessId } });
    const phoneNumberId = business?.phoneNumberId || process.env.PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      return res.status(400).json({
        error: 'WhatsApp phone number not configured — add Phone Number ID in Settings or PHONE_NUMBER_ID env',
      });
    }

    const campaign = await prisma.communicationCampaign.create({
      data: {
        businessId: req.user.businessId,
        templateId: template.id,
        status: 'FAILED',
        totalContacts: contacts.length,
        sentCount: 0,
        failedCount: contacts.length,
        totalCharged: '0',
        messageCost: MESSAGE_COST_INR.toFixed(2),
      },
    });

    let sentCount = 0;
    let failedCount = 0;
    let totalCharged = 0;
    const blocked = [];

    for (const contact of contacts) {
      const walletBefore = await prisma.wallet.findUnique({
        where: { businessId: req.user.businessId },
      });
      if (Number(walletBefore?.balance || 0) < MESSAGE_COST_INR) {
        blocked.push({ contactId: contact.id, phone: contact.phone, reason: 'INSUFFICIENT_BALANCE' });
        failedCount += 1;
        continue;
      }

      const content = fillTemplate(template.content, {
        ...variables,
        name: contact.name || variables.name || '',
        phone: contact.phone,
      });
      try {
        await sendWhatsAppText({
          phoneNumberId,
          toPhoneE164: contact.phone,
          body: content,
        });
        const charged = await prisma.$transaction(async (tx) => {
          const wallet = await getOrCreateWallet(tx, req.user.businessId);
          const balance = Number(wallet.balance);
          if (balance < MESSAGE_COST_INR) return false;
          const nextBalance = (balance - MESSAGE_COST_INR).toFixed(2);
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: nextBalance },
          });
          await tx.walletTransaction.create({
            data: {
              businessId: req.user.businessId,
              campaignId: campaign.id,
              contactId: contact.id,
              amount: MESSAGE_COST_INR.toFixed(2),
              type: 'DEBIT',
              description: `Message charge for ${contact.phone}`,
            },
          });
          return true;
        });
        if (!charged) {
          blocked.push({ contactId: contact.id, phone: contact.phone, reason: 'INSUFFICIENT_BALANCE_POST_SEND' });
          failedCount += 1;
          continue;
        }
        await prisma.message.create({
          data: {
            customerId: (await prisma.customer.upsert({
              where: { businessId_phone: { businessId: req.user.businessId, phone: contact.phone } },
              update: { name: contact.name || undefined },
              create: {
                businessId: req.user.businessId,
                phone: contact.phone,
                name: contact.name,
              },
            })).id,
            businessId: req.user.businessId,
            content,
            type: 'STAFF',
          },
        });
        sentCount += 1;
        totalCharged += MESSAGE_COST_INR;
      } catch {
        failedCount += 1;
      }
    }

    const finalStatus = sentCount === contacts.length ? 'COMPLETED' : sentCount > 0 ? 'PARTIAL' : 'FAILED';
    const updatedCampaign = await prisma.communicationCampaign.update({
      where: { id: campaign.id },
      data: {
        status: finalStatus,
        sentCount,
        failedCount,
        totalCharged: totalCharged.toFixed(2),
      },
    });

    const wallet = await prisma.wallet.findUnique({ where: { businessId: req.user.businessId } });

    res.json({
      campaign: updatedCampaign,
      sentCount,
      failedCount,
      blocked,
      walletBalance: wallet?.balance || '0',
      messageCost: MESSAGE_COST_INR,
    });
  } catch (e) {
    next(e);
  }
}
