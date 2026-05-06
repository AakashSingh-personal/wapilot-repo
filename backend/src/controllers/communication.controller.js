import { prisma } from '../lib/prisma.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';

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
    const rawLimit = Number(req.query?.limit);
    const rawOffset = Number(req.query?.offset);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const where = { businessId: req.user.businessId };
    if (type === 'CREDIT' || type === 'DEBIT') where.type = type;

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
    const businessId = req.user.businessId;

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, businessId);
      const nextBalance = (Number(wallet.balance) + amountNum).toFixed(2);
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: nextBalance },
      });
      await tx.walletTransaction.create({
        data: {
          businessId,
          amount,
          type: 'CREDIT',
          description: req.body?.description || 'Wallet top-up',
        },
      });
      return updated;
    });

    res.status(201).json({ wallet: result });
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
    const templates = await prisma.template.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (e) {
    next(e);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const name = req.body?.name?.trim();
    const content = req.body?.content?.trim();
    if (!name || !content) {
      return res.status(400).json({ error: 'name and content are required' });
    }
    const template = await prisma.template.create({
      data: {
        businessId: req.user.businessId,
        name,
        content,
        status: 'WORKING',
      },
    });
    res.status(201).json({ template });
  } catch (e) {
    next(e);
  }
}

export async function updateTemplateStatus(req, res, next) {
  try {
    const status = req.body?.status;
    if (!['WORKING', 'NOT_WORKING'].includes(status)) {
      return res.status(400).json({ error: 'status must be WORKING or NOT_WORKING' });
    }
    const template = await prisma.template.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const updated = await prisma.template.update({
      where: { id: template.id },
      data: { status },
    });
    res.json({ template: updated });
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
