import { prisma } from '../lib/prisma.js';
import { fetchWhatsAppMediaById } from '../services/whatsapp.service.js';

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
    const customers = await prisma.customer.findMany({
      where: { businessId },
      include: {
        messages: {
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

    const rows = customers
      .map((c) => {
        const last = c.messages[0];
        return {
          id: c.id,
          phone: c.phone,
          name: c.name,
          createdAt: c.createdAt,
          lastMessage: last
            ? {
                id: last.id,
                content: last.content,
                type: last.type,
                createdAt: last.createdAt,
              }
            : null,
        };
      })
      .sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, limit);

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
    const messages = await prisma.message.findMany({
      where: {
        businessId: req.user.businessId,
        customerId,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (e) {
    next(e);
  }
}

export async function whatsappMedia(req, res, next) {
  try {
    const { mediaId } = req.params;
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
