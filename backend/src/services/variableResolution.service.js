import { prisma } from '../lib/prisma.js';

/** Keys resolved from business / customer / clock — cannot be redefined as custom fields. */
export const RESERVED_VARIABLE_KEYS = new Set([
  'business_name',
  'business_phone',
  'owner_name',
  'support_number',
  'current_date',
  'current_time',
  'customer_name',
  'customer_phone',
  'name',
  'phone',
]);

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function extractTemplatePlaceholders(text) {
  const numbered = new Set();
  const named = new Set();
  const s = String(text || '');
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(s))) {
    const inner = String(m[1] || '').trim();
    if (!inner) continue;
    if (/^\d+$/.test(inner)) numbered.add(parseInt(inner, 10));
    else named.add(inner);
  }
  return {
    numbered: [...numbered].sort((a, b) => a - b),
    named: [...named],
  };
}

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function formatDisplayDate(d) {
  try {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatDisplayTime(d) {
  try {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function resolveBuiltin({
  key,
  business,
  owner,
  customer,
  contactName,
  contactPhone,
  now,
}) {
  switch (key) {
    case 'name':
    case 'customer_name':
      return String(customer?.name || contactName || '').trim();
    case 'phone':
    case 'customer_phone':
      return String(customer?.phone || contactPhone || '').trim();
    case 'business_name':
      return String(business?.name || '').trim();
    case 'business_phone':
      return String(process.env.BUSINESS_DISPLAY_PHONE || '').trim();
    case 'owner_name': {
      const email = owner?.email || '';
      const at = email.indexOf('@');
      return (at > 0 ? email.slice(0, at) : email).trim() || email;
    }
    case 'support_number':
      return String(process.env.SUPPORT_PHONE || '').trim();
    case 'current_date':
      return formatDisplayDate(now);
    case 'current_time':
      return formatDisplayTime(now);
    default:
      return '';
  }
}

/**
 * @param {object} opts
 * @param {string} opts.businessId
 * @param {{ id: string, content: string }} opts.template
 * @param {Record<string, string>} [opts.extraVariables] legacy / send-time overrides
 * @param {string|null} [opts.customerId]
 * @param {string|null} [opts.contactName]
 * @param {string|null} [opts.contactPhone]
 */
export async function resolvePersonalizedTemplateText(opts) {
  const {
    businessId,
    template,
    extraVariables = {},
    customerId = null,
    contactName = null,
    contactPhone = null,
  } = opts;

  const [business, mappings, definitions, customer, customerValues] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      include: { config: true },
    }),
    prisma.templateVariableMapping.findMany({
      where: { templateId: template.id },
      orderBy: { placeholderIndex: 'asc' },
    }),
    prisma.variableDefinition.findMany({ where: { businessId } }),
    customerId
      ? prisma.customer.findFirst({
          where: { id: customerId, businessId },
        })
      : null,
    customerId
      ? prisma.customerVariableValue.findMany({
          where: { customerId },
        })
      : [],
  ]);

  const owner =
    business?.ownerId &&
    (await prisma.user.findFirst({
      where: { id: business.ownerId },
      select: { email: true },
    }));

  const definitionByKey = new Map(
    definitions.map((d) => [normalizeKey(d.key), d]),
  );
  const valueByDefId = new Map(
    customerValues.map((v) => [v.variableDefinitionId, v.value]),
  );
  const indexToVariableKey = new Map(
    mappings.map((m) => [m.placeholderIndex, m.variableKey]),
  );

  const overrides = {};
  for (const [k, v] of Object.entries(extraVariables || {})) {
    overrides[normalizeKey(k)] = v === undefined || v === null ? '' : String(v);
  }

  const now = new Date();

  const resolveKey = (rawKey) => {
    const k = normalizeKey(rawKey);
    if (!k) return '';

    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      return overrides[k];
    }

    if (RESERVED_VARIABLE_KEYS.has(k)) {
      return resolveBuiltin({
        key: k,
        business,
        owner,
        customer,
        contactName,
        contactPhone,
        now,
      });
    }

    const def = definitionByKey.get(k);
    if (!def) return '';

    if (def.type === 'BUSINESS') {
      return def.defaultValue ?? '';
    }

    if (def.type === 'CUSTOMER') {
      const stored = valueByDefId.get(def.id);
      if (stored !== undefined && stored !== null && String(stored).trim() !== '') {
        return String(stored);
      }
      return def.defaultValue ?? '';
    }

    return '';
  };

  return String(template.content || '').replace(PLACEHOLDER_RE, (_, innerRaw) => {
    const inner = String(innerRaw || '').trim();
    if (!inner) return '';
    if (/^\d+$/.test(inner)) {
      const idx = parseInt(inner, 10);
      const varKey = indexToVariableKey.get(idx);
      if (!varKey) return '';
      return resolveKey(varKey);
    }
    return resolveKey(inner);
  });
}
