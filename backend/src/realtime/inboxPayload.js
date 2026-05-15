import { prisma } from '../lib/prisma.js';
import { computeMessageStatus, computeSessionStatus } from '../utils/conversationStatus.js';

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

  const rows = await prisma.$queryRaw`
    WITH last_msg AS (
      SELECT m.id, m.content, m.type::text AS type, m."createdAt"
      FROM "Message" m
      WHERE m."businessId" = ${bid}::uuid AND m."customerId" = ${cid}::uuid
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ),
    latest_out AS (
      SELECT m.content, m."createdAt"
      FROM "Message" m
      WHERE m."businessId" = ${bid}::uuid AND m."customerId" = ${cid}::uuid
        AND m.type IN ('BOT', 'STAFF')
      ORDER BY m."createdAt" DESC
      LIMIT 1
    )
    SELECT
      c.id,
      c.phone,
      c.name,
      c."createdAt",
      c."lastInboundCustomerMessageAt",
      c."inboxUnreadCount",
      c."aiEnabled",
      c."aiOverride",
      c."aiOverrideAt",
      c."aiResumeMode"::text AS "aiResumeMode",
      c."aiOverrideByUserId",
      u.email AS "overrideEmail",
      lm.id AS "lastMsgId",
      lm.content AS "lastMsgContent",
      lm.type AS "lastMsgType",
      lm."createdAt" AS "lastMsgCreatedAt",
      lo.content AS "outContent",
      lo."createdAt" AS "outCreatedAt",
      CASE
        WHEN lo."createdAt" IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM "Message" u
          WHERE u."businessId" = ${bid}::uuid
            AND u."customerId" = ${cid}::uuid
            AND u.type = 'USER'
            AND u."createdAt" > lo."createdAt"
        )
      END AS replied
    FROM "Customer" c
    LEFT JOIN last_msg lm ON true
    LEFT JOIN latest_out lo ON true
    LEFT JOIN "User" u ON u.id = c."aiOverrideByUserId"
    WHERE c.id = ${cid}::uuid AND c."businessId" = ${bid}::uuid
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const latestOut = row.outCreatedAt
    ? { content: row.outContent, createdAt: row.outCreatedAt }
    : null;
  const hasUserReplyAfter = Boolean(row.replied);

  const messageStatus = latestOut
    ? computeMessageStatus({
        latestOutboundContent: latestOut.content,
        latestOutboundAt: latestOut.createdAt,
        hasUserReplyAfter,
      })
    : null;

  const sessionStatus = computeSessionStatus(row.lastInboundCustomerMessageAt);
  const aiCustomer = {
    aiEnabled: row.aiEnabled,
    aiOverride: row.aiOverride,
    aiOverrideAt: row.aiOverrideAt,
    aiResumeMode: row.aiResumeMode,
    aiOverrideByUserId: row.aiOverrideByUserId,
    aiOverrideBy: row.overrideEmail ? { email: row.overrideEmail } : null,
  };

  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    createdAt: row.createdAt,
    lastInboundCustomerMessageAt: row.lastInboundCustomerMessageAt,
    inboxUnreadCount: row.inboxUnreadCount,
    aiControl: mapCustomerAiControl(aiCustomer),
    sessionStatus,
    messageStatus,
    lastMessage: row.lastMsgId
      ? {
          id: row.lastMsgId,
          content: row.lastMsgContent,
          type: row.lastMsgType,
          createdAt: row.lastMsgCreatedAt,
        }
      : null,
  };
}
