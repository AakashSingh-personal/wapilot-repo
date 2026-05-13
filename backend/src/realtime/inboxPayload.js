import { prisma } from '../lib/prisma.js';
import { computeMessageStatus, computeSessionStatus } from '../utils/conversationStatus.js';

const aiControlSelect = {
  aiEnabled: true,
  aiOverride: true,
  aiOverrideAt: true,
  aiResumeMode: true,
  aiOverrideByUserId: true,
  aiOverrideBy: { select: { email: true } },
};

function mapCustomerAiControl(c) {
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

/**
 * One inbox row in the same shape as GET /dashboard/conversations items.
 * Used to push conversation list updates over WebSocket without a second REST call.
 */
export async function buildInboxRowForCustomer(businessId, customerId) {
  const bid = String(businessId);
  const cid = String(customerId);

  const customer = await prisma.customer.findFirst({
    where: { id: cid, businessId: bid },
    select: {
      id: true,
      phone: true,
      name: true,
      createdAt: true,
      lastInboundCustomerMessageAt: true,
      inboxUnreadCount: true,
      ...aiControlSelect,
      messages: {
        where: { businessId: bid },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, type: true, createdAt: true },
      },
    },
  });
  if (!customer) return null;

  const latestOut = await prisma.message.findFirst({
    where: { businessId: bid, customerId: cid, type: { in: ['BOT', 'STAFF'] } },
    orderBy: { createdAt: 'desc' },
    select: { content: true, createdAt: true },
  });

  let hasUserReplyAfter = false;
  if (latestOut) {
    const userAfter = await prisma.message.findFirst({
      where: {
        businessId: bid,
        customerId: cid,
        type: 'USER',
        createdAt: { gt: latestOut.createdAt },
      },
      select: { id: true },
    });
    hasUserReplyAfter = Boolean(userAfter);
  }

  const messageStatus = latestOut
    ? computeMessageStatus({
        latestOutboundContent: latestOut.content,
        latestOutboundAt: latestOut.createdAt,
        hasUserReplyAfter,
      })
    : null;

  const sessionStatus = computeSessionStatus(customer.lastInboundCustomerMessageAt);
  const last = customer.messages[0];

  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    createdAt: customer.createdAt,
    lastInboundCustomerMessageAt: customer.lastInboundCustomerMessageAt,
    inboxUnreadCount: customer.inboxUnreadCount,
    aiControl: mapCustomerAiControl(customer),
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
}
