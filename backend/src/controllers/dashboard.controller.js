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

    const [leadCount, bookingCount, leadsInRange, paidCustomerTotal] = await Promise.all([
      prisma.lead.count({ where: { businessId } }),
      prisma.booking.count({ where: { businessId } }),
      prisma.lead.findMany({
        where: { businessId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.customerPayment.aggregate({
        where: { businessId, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(paidCustomerTotal._sum.amount || 0);

    const leadsByDay = {};
    for (const row of leadsInRange) {
      const day = row.createdAt.toISOString().slice(0, 10);
      leadsByDay[day] = (leadsByDay[day] || 0) + 1;
    }

    res.json({
      leads: leadCount,
      bookings: bookingCount,
      revenue,
      leadsOverTime: Object.entries(leadsByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    });
  } catch (e) {
    next(e);
  }
}

export async function listCustomers(req, res, next) {
  try {
    const customers = await prisma.customer.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(customers);
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

    const statusRows = await prisma.$queryRaw`
      WITH latest_out AS (
        SELECT DISTINCT ON ("customerId") "customerId", content, "createdAt"
        FROM "Message"
        WHERE "businessId" = ${businessId}::uuid AND type IN ('BOT', 'STAFF')
        ORDER BY "customerId", "createdAt" DESC
      )
      SELECT lo."customerId", lo.content, lo."createdAt",
        EXISTS (
          SELECT 1 FROM "Message" u
          WHERE u."businessId" = ${businessId}::uuid AND u."customerId" = lo."customerId"
          AND u.type = 'USER' AND u."createdAt" > lo."createdAt"
        ) AS replied
      FROM latest_out lo
    `;

    const messageStatusByCustomer = new Map();
    for (const row of statusRows) {
      const cid = row.customerId;
      messageStatusByCustomer.set(
        cid,
        computeMessageStatus({
          latestOutboundContent: row.content,
          latestOutboundAt: row.createdAt,
          hasUserReplyAfter: Boolean(row.replied),
        }),
      );
    }

    const customers = await prisma.customer.findMany({
      where: { businessId },
      select: {
        id: true,
        phone: true,
        name: true,
        createdAt: true,
        lastInboundCustomerMessageAt: true,
        inboxUnreadCount: true,
        ...aiControlInclude,
        messages: {
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            type: true,
            createdAt: true,
          },
        },
      },
    });

    let rows = customers.map((c) => {
      const last = c.messages[0];
      const sessionStatus = computeSessionStatus(c.lastInboundCustomerMessageAt);
      const messageStatus = messageStatusByCustomer.get(c.id) ?? null;
      return {
        id: c.id,
        phone: c.phone,
        name: c.name,
        createdAt: c.createdAt,
        lastInboundCustomerMessageAt: c.lastInboundCustomerMessageAt,
        inboxUnreadCount: c.inboxUnreadCount,
        aiControl: mapCustomerAiControl(c),
        sessionStatus,
        messageStatus,
        lastMessage: last
          ? {
              id: last.id,
              content: last.content,
              type: last.type,
              createdAt: last.createdAt,
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

    rows.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    rows = rows.slice(0, limit);

    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function listLeads(req, res, next) {
  try {
    const leads = await prisma.lead.findMany({
      where: { businessId: req.user.businessId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(leads);
  } catch (e) {
    next(e);
  }
}

export async function messagesForCustomer(req, res, next) {
  try {
    const { customerId } = req.params;
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, businessId: req.user.businessId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    await prisma.customer.updateMany({
      where: { id: customerId, businessId: req.user.businessId },
      data: { inboxUnreadCount: 0 },
    });

    await publishInboxLive({
      businessId: req.user.businessId,
      customerId,
      type: EventType.UNREAD_CHANGED,
      reason: 'cleared',
    });

    const [messages, customerRow] = await Promise.all([
      prisma.message.findMany({
        where: {
          businessId: req.user.businessId,
          customerId,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.customer.findFirst({
        where: { id: customerId, businessId: req.user.businessId },
        select: aiControlInclude,
      }),
    ]);

    res.json({
      messages,
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
    const bookings = await prisma.booking.findMany({
      where: { businessId: req.user.businessId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(bookings);
  } catch (e) {
    next(e);
  }
}

export async function listPayments(req, res, next) {
  try {
    const payments = await prisma.payment.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    const customerPayments = await prisma.customerPayment.findMany({
      where: { businessId: req.user.businessId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ subscriptionPayments: payments, customerPayments });
  } catch (e) {
    next(e);
  }
}
