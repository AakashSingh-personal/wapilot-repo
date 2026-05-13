import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { publish } from '../realtime/publisher.js';
import { EventType } from '../realtime/events.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';
import { structuredContent } from '../utils/waStructuredMessage.js';
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

function toMetaTemplateTextWithSamples(content) {
  const keys = [];
  const seen = new Map();
  const text = String(content || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const cleaned = String(key || '').trim();
    if (!cleaned) return _m;
    if (!seen.has(cleaned)) {
      keys.push(cleaned);
      seen.set(cleaned, keys.length);
    }
    return `{{${seen.get(cleaned)}}}`;
  });
  return { text, samples: keys };
}

function mapMetaStatusToLocal(metaStatus) {
  return metaStatus === 'APPROVED' ? 'WORKING' : 'NOT_WORKING';
}

function extractBodyTextFromComponents(components = []) {
  const body = (Array.isArray(components) ? components : []).find((c) => c?.type === 'BODY');
  return typeof body?.text === 'string' ? body.text : '';
}

function normalizeMetaComponents(components) {
  if (!Array.isArray(components)) return [];
  return components.map((component) => {
    if (!component || typeof component !== 'object') return component;
    const next = { ...component };
    if (typeof next.text === 'string') {
      const normalized = toMetaTemplateTextWithSamples(next.text);
      next.text = normalized.text;
      if (normalized.samples.length && (next.type === 'BODY' || next.type === 'HEADER')) {
        const exampleKey = next.type === 'BODY' ? 'body_text' : 'header_text';
        next.example = {
          ...(next.example && typeof next.example === 'object' ? next.example : {}),
          [exampleKey]: [normalized.samples],
        };
      }
    }
    if (Array.isArray(next.buttons)) {
      next.buttons = next.buttons.map((button) => {
        if (!button || typeof button !== 'object') return button;
        const b = { ...button };
        if (typeof b.text === 'string') b.text = b.text.trim();
        if (typeof b.url === 'string') {
          const normalizedUrl = toMetaTemplateTextWithSamples(b.url.trim());
          b.url = normalizedUrl.text;
          if (normalizedUrl.samples.length) {
            b.example = normalizedUrl.samples;
          }
        }
        return b;
      });
    }
    return next;
  });
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
    const meta = byName.get(metaName) || byName.get(t.name);
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

/** Undo a per-message debit when WhatsApp send fails or is skipped (keeps wallet truthful). */
async function refundCommunicationCharge({ businessId, campaignId, contactId, phone }) {
  await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, businessId);
    const balance = Number(wallet.balance);
    const nextBalance = (balance + MESSAGE_COST_INR).toFixed(2);
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: nextBalance },
    });
    await tx.walletTransaction.create({
      data: {
        businessId,
        campaignId,
        contactId,
        amount: MESSAGE_COST_INR.toFixed(2),
        type: 'CREDIT',
        description: `Refund: WhatsApp send failed for ${phone}`,
      },
    });
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

export async function deleteContact(req, res, next) {
  try {
    const { id } = req.params;
    const contact = await prisma.contact.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    await prisma.contact.delete({ where: { id: contact.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function contactBook(req, res, next) {
  try {
    const businessId = req.user.businessId;
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { config: true },
    });

    const parseCatalog = (value) => {
      if (Array.isArray(value)) return { services: value, products: [] };
      if (value && typeof value === 'object') {
        return {
          services: Array.isArray(value.services) ? value.services : [],
          products: Array.isArray(value.products) ? value.products : [],
        };
      }
      return { services: [], products: [] };
    };

    const catalog = parseCatalog(business?.config?.services);
    const productNameSet = new Set(
      (catalog.products || [])
        .map((p) => (p && typeof p === 'object' ? p.name : p))
        .map((n) => String(n || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const contacts = await prisma.contact.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });

    const phones = Array.from(
      new Set(
        (contacts || [])
          .map((c) => c.phone)
          .filter((p) => typeof p === 'string' && p.trim()),
      ),
    );

    const customers = phones.length
      ? await prisma.customer.findMany({
          where: { businessId, phone: { in: phones } },
          select: { id: true, phone: true, name: true },
        })
      : [];

    const phoneToCustomer = new Map(customers.map((c) => [c.phone, c]));
    const customerIds = customers.map((c) => c.id);

    const [paidSums, bookingCounts, bookings] = await Promise.all([
      customerIds.length
        ? prisma.customerPayment.groupBy({
            by: ['customerId'],
            where: { businessId, customerId: { in: customerIds }, status: 'PAID' },
            _sum: { amount: true },
          })
        : [],
      customerIds.length
        ? prisma.booking.groupBy({
            by: ['customerId'],
            where: { businessId, customerId: { in: customerIds } },
            _count: { _all: true },
          })
        : [],
      customerIds.length
        ? prisma.booking.findMany({
            where: { businessId, customerId: { in: customerIds } },
            select: { id: true, customerId: true, service: true },
            orderBy: { createdAt: 'desc' },
            take: 5000,
          })
        : [],
    ]);

    const paidByCustomer = new Map(paidSums.map((r) => [r.customerId, Number(r._sum?.amount || 0)]));
    const bookingCountByCustomer = new Map(bookingCounts.map((r) => [r.customerId, r._count?._all || 0]));
    const bookingIdsByCustomer = new Map();
    const productsByCustomer = new Map();
    for (const b of bookings) {
      if (!bookingIdsByCustomer.has(b.customerId)) bookingIdsByCustomer.set(b.customerId, []);
      bookingIdsByCustomer.get(b.customerId).push(b.id);
      const service = typeof b.service === 'string' ? b.service.trim() : '';
      const normalized = service.toLowerCase();
      if (service && productNameSet.has(normalized)) {
        if (!productsByCustomer.has(b.customerId)) productsByCustomer.set(b.customerId, new Map());
        const m = productsByCustomer.get(b.customerId);
        m.set(service, (m.get(service) || 0) + 1);
      }
    }

    const rows = contacts.map((c) => {
      const customer = phoneToCustomer.get(c.phone) || null;
      const customerId = customer?.id || null;
      const productCounts = customerId ? productsByCustomer.get(customerId) : null;
      const productsBought =
        productCounts && productCounts.size
          ? Array.from(productCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => ({ name, count }))
          : [];
      return {
        id: c.id,
        name: c.name || customer?.name || null,
        phone: c.phone,
        createdAt: c.createdAt,
        customerId,
        amountPaid: customerId ? paidByCustomer.get(customerId) || 0 : 0,
        bookingCount: customerId ? bookingCountByCustomer.get(customerId) || 0 : 0,
        bookingIds: customerId ? bookingIdsByCustomer.get(customerId) || [] : [],
        productsBought,
      };
    });

    res.json({ rows });
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
    let metaTemplates = [];
    let metaSyncError = null;
    try {
      metaTemplates = await listWhatsAppTemplates();
      const byName = new Map(metaTemplates.map((t) => [t.name, t]));
      const localForSync = await prisma.template.findMany({
        where: { businessId: req.user.businessId },
        select: { id: true, name: true, status: true },
      });
      const updates = [];
      for (const t of localForSync) {
        const metaName = toMetaTemplateName(t.name, req.user.businessId);
        const meta = byName.get(metaName) || byName.get(t.name);
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
    } catch (err) {
      metaSyncError = err?.message || 'Meta sync failed';
      // Keep local templates usable even when Meta status sync fails.
      try {
        await syncTemplateStatusesFromMeta(req.user.businessId);
      } catch {
        // ignore fallback sync failure
      }
    }

    const templates = await prisma.template.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    const byMetaName = new Map((metaTemplates || []).map((t) => [t.name, t]));
    const withMeta = templates.map((t) => {
      const metaName = toMetaTemplateName(t.name, req.user.businessId);
      const meta = byMetaName.get(metaName) || byMetaName.get(t.name) || null;
      return {
        ...t,
        metaName,
        metaStatus: meta?.status || null,
        metaCategory: meta?.category || null,
      };
    });
    res.json({ templates: withMeta, metaSyncError });
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
          components: normalizeMetaComponents(metaPayload.components || []),
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
    if (typeof e?.message === 'string' && e.message.includes('Meta template create failed:')) {
      e.statusCode = 400;
      e.publicMessage = e.message.replace('Meta template create failed:', '').trim();
    }
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
    const meta = metaTemplates.find((t) => t.name === metaName || t.name === template.name);
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
    const { templateId, contactId, contactIds = [], customerIds = [], variables = {} } = req.body || {};
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    const template = await prisma.template.findFirst({
      where: { id: templateId, businessId: req.user.businessId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (template.status !== 'WORKING') {
      return res.status(400).json({ error: 'Template is marked as NOT_WORKING' });
    }

    const contactIdSet = [...new Set([contactId, ...contactIds].filter(Boolean))];
    const customerIdSet = [...new Set([...(customerIds || [])].filter(Boolean))];

    const [contacts, customers] = await Promise.all([
      contactIdSet.length
        ? prisma.contact.findMany({
            where: { businessId: req.user.businessId, id: { in: contactIdSet } },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      customerIdSet.length
        ? prisma.customer.findMany({
            where: { businessId: req.user.businessId, id: { in: customerIdSet } },
            orderBy: { createdAt: 'asc' },
          })
        : [],
    ]);

    const targets = [
      ...contacts.map((c) => ({
        phone: normalizePhone(c.phone),
        name: c.name,
        walletContactId: c.id,
        customerId: null,
      })),
      ...customers.map((c) => ({
        phone: normalizePhone(c.phone),
        name: c.name,
        walletContactId: null,
        customerId: c.id,
      })),
    ];

    if (!targets.length) {
      return res.status(400).json({ error: 'Provide at least one contactId or customerId' });
    }

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
        totalContacts: targets.length,
        sentCount: 0,
        failedCount: targets.length,
        totalCharged: '0',
        messageCost: MESSAGE_COST_INR.toFixed(2),
      },
    });

    let sentCount = 0;
    let failedCount = 0;
    let totalCharged = 0;
    const blocked = [];

    for (const target of targets) {
      const walletBefore = await prisma.wallet.findUnique({
        where: { businessId: req.user.businessId },
      });
      if (Number(walletBefore?.balance || 0) < MESSAGE_COST_INR) {
        blocked.push({
          contactId: target.walletContactId,
          customerId: target.customerId,
          phone: target.phone,
          reason: 'INSUFFICIENT_BALANCE',
        });
        failedCount += 1;
        continue;
      }

      const content = fillTemplate(template.content, {
        ...variables,
        name: target.name || variables.name || '',
        phone: target.phone,
      });
      try {
        // Debit before calling Meta so we never report "failed" after WhatsApp already accepted the message.
        const debited = await prisma.$transaction(async (tx) => {
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
              contactId: target.walletContactId,
              amount: MESSAGE_COST_INR.toFixed(2),
              type: 'DEBIT',
              description: `Message charge for ${target.phone}`,
            },
          });
          return true;
        });
        if (!debited) {
          blocked.push({
            contactId: target.walletContactId,
            customerId: target.customerId,
            phone: target.phone,
            reason: 'INSUFFICIENT_BALANCE',
          });
          failedCount += 1;
          continue;
        }

        let sendRes;
        try {
          sendRes = await sendWhatsAppText({
            phoneNumberId,
            toPhoneE164: target.phone,
            body: content,
          });
        } catch (sendErr) {
          await refundCommunicationCharge({
            businessId: req.user.businessId,
            campaignId: campaign.id,
            contactId: target.walletContactId,
            phone: target.phone,
          }).catch((refundErr) =>
            log('error', 'communications_refund_after_send_failed', {
              message: refundErr.message,
              phone: target.phone,
            }),
          );
          log('warn', 'communications_send_whatsapp_failed', {
            message: sendErr.message,
            code: sendErr.code,
            phone: target.phone,
          });
          failedCount += 1;
          continue;
        }

        if (sendRes?.skipped) {
          await refundCommunicationCharge({
            businessId: req.user.businessId,
            campaignId: campaign.id,
            contactId: target.walletContactId,
            phone: target.phone,
          }).catch((refundErr) =>
            log('error', 'communications_refund_after_skipped_send', {
              message: refundErr.message,
              phone: target.phone,
            }),
          );
          blocked.push({
            contactId: target.walletContactId,
            customerId: target.customerId,
            phone: target.phone,
            reason: 'WHATSAPP_NOT_CONFIGURED',
          });
          failedCount += 1;
          continue;
        }

        const waMessageId = sendRes?.messages?.[0]?.id;
        if (!waMessageId) {
          log('warn', 'communications_send_missing_wa_message_id', { phone: target.phone });
        }

        // WhatsApp accepted the message and wallet is already debited — DB errors here must not mark send as failed.
        try {
          const customerRecord = await prisma.customer.upsert({
            where: { businessId_phone: { businessId: req.user.businessId, phone: target.phone } },
            update: { name: target.name || undefined },
            create: {
              businessId: req.user.businessId,
              phone: target.phone,
              name: target.name,
            },
          });
          await prisma.message.create({
            data: {
              customerId: customerRecord.id,
              businessId: req.user.businessId,
              content: structuredContent({
                kind: 'text',
                text: content,
                direction: 'outbound',
                status: 'sent',
                waMessageId: waMessageId || undefined,
                source: 'template_campaign',
              }),
              type: 'STAFF',
            },
          });
          try {
            const pauseBy = req.user?.userId ?? null;
            await prisma.customer.update({
              where: { id: customerRecord.id },
              data: {
                aiOverride: true,
                aiOverrideByUserId: pauseBy,
                aiOverrideAt: new Date(),
              },
            });
          } catch (pauseErr) {
            log('warn', 'communications_ai_pause_failed', {
              message: pauseErr.message,
              code: pauseErr.code,
              customerId: customerRecord.id,
            });
          }
          await publish({
            businessId: req.user.businessId,
            customerId: customerRecord.id,
            conversationId: customerRecord.id,
            type: EventType.MESSAGE_CREATED,
            reason: 'template_campaign',
          });
          await publish({
            businessId: req.user.businessId,
            customerId: customerRecord.id,
            conversationId: customerRecord.id,
            type: EventType.AI_CONTROL_CHANGED,
            reason: 'template_send_pause',
          });
        } catch (bookErr) {
          log('error', 'communications_post_send_bookkeeping_failed', {
            message: bookErr.message,
            code: bookErr.code,
            phone: target.phone,
          });
        }
        sentCount += 1;
        totalCharged += MESSAGE_COST_INR;
      } catch (loopErr) {
        log('warn', 'communications_send_iteration_failed', {
          message: loopErr.message,
          code: loopErr.code,
          phone: target.phone,
        });
        failedCount += 1;
      }
    }

    const finalStatus =
      sentCount === targets.length ? 'COMPLETED' : sentCount > 0 ? 'PARTIAL' : 'FAILED';
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

    const c = updatedCampaign;
    res.json({
      campaign: {
        id: c.id,
        businessId: c.businessId,
        templateId: c.templateId,
        status: c.status,
        totalContacts: c.totalContacts,
        sentCount: c.sentCount,
        failedCount: c.failedCount,
        totalCharged: Number(c.totalCharged),
        messageCost: Number(c.messageCost),
        createdAt: c.createdAt,
      },
      sentCount,
      failedCount,
      blocked,
      walletBalance: wallet ? Number(wallet.balance) : 0,
      messageCost: MESSAGE_COST_INR,
    });
  } catch (e) {
    log('error', 'communications_send_failed', {
      message: e.message,
      code: e.code,
      meta: e.meta,
    });
    next(e);
  }
}
