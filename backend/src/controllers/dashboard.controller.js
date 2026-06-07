import { prisma } from '../lib/prisma.js';
import { publishInboxLive } from '../realtime/publishInbox.js';
import { EventType } from '../realtime/events.js';
import { fetchWhatsAppMediaById } from '../services/whatsapp.service.js';
import { computeSessionStatus, computeMessageStatus } from '../utils/conversationStatus.js';
import { resumeAiFromLastCustomerMessage } from '../services/webhook.service.js';

const aiControlInclude = {
  aiEnabled: true,
  aiOverride: true,
  aiOverrideAt: true,
  aiResumeMode: true,
  aiOverrideByUserId: true,
  aiOverrideBy: { select: { email: true } },
};

export function mapCustomerAiControl(c) {
  if (!c) return null;
  return {
    aiEnabled: c.aiEnabled,
    aiOverride: c.aiOverride,
    aiOverrideAt: c.aiOverrideAt,
    aiResumeMode: c.aiResumeMode,
    pausedByEmail: c.aiOverrideBy?.email ?? null,
    pausedByUserId: c.aiOverrideByUserId ?? null,
  };
}

function parseCsvFilter(param) {
  if (!param || typeof param !== 'string') return null;
  const set = new Set(
    param
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.size ? set : null;
}

export async function stats(req, res, next) {
  try {
    const businessId = req.user.businessId;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [leadCount, bookingCount, leadsByDayRows, paidCustomerTotal] = await Promise.all([
      prisma.lead.count({ where: { businessId } }),
      prisma.booking.count({ where: { businessId } }),
      prisma.$queryRaw`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM "Lead"
        WHERE "businessId" = ${businessId}::uuid AND "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      prisma.customerPayment.aggregate({
        where: { businessId, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(paidCustomerTotal._sum.amount || 0);

    res.json({
      leads: leadCount,
      bookings: bookingCount,
      revenue,
      leadsOverTime: leadsByDayRows.map((row) => ({
        date: row.day,
        count: Number(row.count),
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function listCustomers(req, res, next) {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 1000) : 500;
    const customers = await prisma.customer.findMany({
      where: { businessId: req.user.businessId },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        createdAt: true,
        lastInboundCustomerMessageAt: true,
        inboxUnreadCount: true,
        appointmentStats: {
          select: {
            totalVisits: true,
            lifetimeSpend: true,
            lastVisitAt: true,
            avgRating: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(customers);
  } catch (e) {
    next(e);
  }
}

export async function patchCustomer(req, res, next) {
  try {
    const { customerId } = req.params;
    const businessId = req.user.businessId;
    const { name, email } = req.body || {};

    const existing = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
    });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const data = {};
    if (name !== undefined) data.name = String(name).trim() || null;
    if (email !== undefined) {
      const trimmed = String(email).trim();
      if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      data.email = trimmed || null;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'Provide name and/or email to update' });
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        createdAt: true,
        lastInboundCustomerMessageAt: true,
        inboxUnreadCount: true,
      },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

/** Inbox: customers with last message preview, sorted by recent activity (WhatsApp + web). */
export async function listConversations(req, res, next) {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 500) : 500;

    const businessId = req.user.businessId;
    const sessionFilter = parseCsvFilter(req.query.sessionStatus);
    const messageFilter = parseCsvFilter(req.query.messageStatus);
    const hasFilters = Boolean(sessionFilter || messageFilter);
    const sqlLimit = hasFilters ? 2000 : limit;

    const dbRows = await prisma.$queryRaw`
      WITH latest_msg AS (
        SELECT DISTINCT ON (m."customerId")
          m."customerId",
          m.id AS msg_id,
          m.content AS msg_content,
          m.type::text AS msg_type,
          m."createdAt" AS msg_created_at
        FROM "Message" m
        WHERE m."businessId" = ${businessId}::uuid
        ORDER BY m."customerId", m."createdAt" DESC
      ),
      latest_out AS (
        SELECT DISTINCT ON (m."customerId")
          m."customerId",
          m.content AS out_content,
          m."createdAt" AS out_created_at
        FROM "Message" m
        WHERE m."businessId" = ${businessId}::uuid AND m.type IN ('BOT', 'STAFF')
        ORDER BY m."customerId", m."createdAt" DESC
      )
      SELECT
        c.id,
        c.phone,
        c.name,
        c.email,
        c."createdAt",
        c."lastInboundCustomerMessageAt",
        c."inboxUnreadCount",
        c."aiEnabled",
        c."aiOverride",
        c."aiOverrideAt",
        c."aiResumeMode"::text AS "aiResumeMode",
        c."aiOverrideByUserId",
        lm.msg_id,
        lm.msg_content,
        lm.msg_type,
        lm.msg_created_at,
        lo.out_content,
        lo.out_created_at,
        CASE
          WHEN lo.out_created_at IS NULL THEN false
          ELSE EXISTS (
            SELECT 1 FROM "Message" u
            WHERE u."businessId" = ${businessId}::uuid
              AND u."customerId" = c.id
              AND u.type = 'USER'
              AND u."createdAt" > lo.out_created_at
          )
        END AS replied
      FROM "Customer" c
      LEFT JOIN latest_msg lm ON lm."customerId" = c.id
      LEFT JOIN latest_out lo ON lo."customerId" = c.id
      WHERE c."businessId" = ${businessId}::uuid
      ORDER BY COALESCE(lm.msg_created_at, c."createdAt") DESC
      LIMIT ${sqlLimit}
    `;

    const overrideUserIds = [
      ...new Set(dbRows.map((r) => r.aiOverrideByUserId).filter(Boolean)),
    ];
    const overrideUsers =
      overrideUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: overrideUserIds } },
            select: { id: true, email: true },
          })
        : [];
    const emailByUserId = new Map(overrideUsers.map((u) => [u.id, u.email]));

    let rows = dbRows.map((row) => {
      const sessionStatus = computeSessionStatus(row.lastInboundCustomerMessageAt);
      const messageStatus = row.out_created_at
        ? computeMessageStatus({
            latestOutboundContent: row.out_content,
            latestOutboundAt: row.out_created_at,
            hasUserReplyAfter: Boolean(row.replied),
          })
        : null;
      const aiCustomer = {
        aiEnabled: row.aiEnabled,
        aiOverride: row.aiOverride,
        aiOverrideAt: row.aiOverrideAt,
        aiResumeMode: row.aiResumeMode,
        aiOverrideByUserId: row.aiOverrideByUserId,
        aiOverrideBy: row.aiOverrideByUserId
          ? { email: emailByUserId.get(row.aiOverrideByUserId) ?? null }
          : null,
      };
      return {
        id: row.id,
        phone: row.phone,
        name: row.name,
        email: row.email,
        createdAt: row.createdAt,
        lastInboundCustomerMessageAt: row.lastInboundCustomerMessageAt,
        inboxUnreadCount: row.inboxUnreadCount,
        aiControl: mapCustomerAiControl(aiCustomer),
        sessionStatus,
        messageStatus,
        lastMessage: row.msg_id
          ? {
              id: row.msg_id,
              content: row.msg_content,
              type: row.msg_type,
              createdAt: row.msg_created_at,
            }
          : null,
      };
    });

    if (sessionFilter) {
      rows = rows.filter((r) => sessionFilter.has(r.sessionStatus));
    }
    if (messageFilter) {
      rows = rows.filter((r) => r.messageStatus && messageFilter.has(r.messageStatus));
    }

    res.json(rows.slice(0, limit));
  } catch (e) {
    next(e);
  }
}

export async function listLeads(req, res, next) {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 500) : 200;
    const leads = await prisma.lead.findMany({
      where: { businessId: req.user.businessId },
      include: {
        customer: { select: { id: true, phone: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(leads);
  } catch (e) {
    next(e);
  }
}

export async function messagesForCustomer(req, res, next) {
  try {
    const { customerId } = req.params;
    const businessId = req.user.businessId;
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 300;

    const customerRow = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, inboxUnreadCount: true, ...aiControlInclude },
    });
    if (!customerRow) return res.status(404).json({ error: 'Customer not found' });

    const messagesPromise = prisma.message.findMany({
      where: { businessId, customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const clearUnreadPromise =
      customerRow.inboxUnreadCount > 0
        ? prisma.customer.updateMany({
            where: { id: customerId, businessId },
            data: { inboxUnreadCount: 0 },
          })
        : Promise.resolve();

    const [messagesDesc] = await Promise.all([messagesPromise, clearUnreadPromise]);

    if (customerRow.inboxUnreadCount > 0) {
      void publishInboxLive({
        businessId,
        customerId,
        type: EventType.UNREAD_CHANGED,
        reason: 'cleared',
        inboxRow: { id: customerId, inboxUnreadCount: 0 },
      });
    }

    res.json({
      messages: messagesDesc.reverse(),
      aiControl: mapCustomerAiControl(customerRow),
    });
  } catch (e) {
    next(e);
  }
}

export async function patchConversationAiControl(req, res, next) {
  try {
    const { customerId } = req.params;
    const businessId = req.user.businessId;
    const { action, resumeMode } = req.body || {};

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    if (action === 'override') {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          aiOverride: true,
          aiOverrideByUserId: req.user.userId,
          aiOverrideAt: new Date(),
        },
      });
      const aiRow = await prisma.customer.findFirst({
        where: { id: customerId, businessId },
        select: aiControlInclude,
      });
      await publishInboxLive({
        businessId,
        customerId,
        type: EventType.AI_CONTROL_CHANGED,
        reason: 'override',
      });
      return res.json({
        ok: true,
        aiControl: mapCustomerAiControl(aiRow),
        notice: 'AI replies paused for this conversation.',
      });
    }

    if (action === 'resume') {
      const mode =
        resumeMode === 'LAST_CUSTOMER_MESSAGE'
          ? 'LAST_CUSTOMER_MESSAGE'
          : 'NEW_MESSAGES_ONLY';

      await prisma.customer.update({
        where: { id: customerId },
        data: {
          aiOverride: false,
          aiOverrideByUserId: null,
          aiOverrideAt: null,
          aiResumeMode: mode,
        },
      });

      let resumeResult = null;
      if (mode === 'LAST_CUSTOMER_MESSAGE') {
        resumeResult = await resumeAiFromLastCustomerMessage({ customerId, businessId });
      }

      const aiRow = await prisma.customer.findFirst({
        where: { id: customerId, businessId },
        select: aiControlInclude,
      });

      await publishInboxLive({
        businessId,
        customerId,
        type: EventType.AI_CONTROL_CHANGED,
        reason: 'resume',
      });

      const skipped = Boolean(resumeResult?.skipped || resumeResult?.reason);
      const notice =
        mode === 'LAST_CUSTOMER_MESSAGE'
          ? skipped
            ? 'AI resumed — latest customer message was not processed (inactive session, empty text, or settings).'
            : 'AI resumed and processed the latest customer message.'
          : 'AI resumed — automation applies on the next customer message.';

      return res.json({
        ok: true,
        aiControl: mapCustomerAiControl(aiRow),
        resumeResult,
        notice,
      });
    }

    return res.status(400).json({ error: 'Invalid action — use override or resume' });
  } catch (e) {
    next(e);
  }
}

export async function whatsappMedia(req, res, next) {
  try {
    const { mediaId } = req.params;
    // Prevent cross-tenant media access: mediaId must exist in this business chat history.
    const linkedMessage = await prisma.message.findFirst({
      where: {
        businessId: req.user.businessId,
        OR: [
          { content: { contains: `"mediaId":"${mediaId}"` } },
          { content: { contains: `"mediaId": "${mediaId}"` } },
        ],
      },
      select: { id: true },
    });
    if (!linkedMessage) {
      return res.status(404).json({ error: 'Media not found' });
    }
    const { buffer, mimeType } = await fetchWhatsAppMediaById(mediaId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (e) {
    next(e);
  }
}

export async function listBookings(req, res, next) {
  try {
    const businessId = req.user.businessId;
    const [legacy, appointments] = await Promise.all([
      prisma.booking.findMany({
        where: { businessId },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.appointment.findMany({
        where: { businessId },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          staff: { select: { id: true, name: true } },
          service: { select: { id: true, name: true, durationMin: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { startAt: 'desc' },
        take: 200,
      }),
    ]);
    res.json({ legacyBookings: legacy, appointments });
  } catch (e) {
    next(e);
  }
}

export async function listPayments(req, res, next) {
  try {
    const businessId = req.user.businessId;
    const [payments, customerPayments] = await Promise.all([
      prisma.payment.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customerPayment.findMany({
        where: { businessId },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.json({ subscriptionPayments: payments, customerPayments });
  } catch (e) {
    next(e);
  }
}
