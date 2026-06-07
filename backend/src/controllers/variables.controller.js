import { prisma } from '../lib/prisma.js';
import {
  RESERVED_ENGINE_KEYS,
  canonicalizeVariableKey,
} from '../services/dynamicFieldEngine.service.js';
import { extractTemplatePlaceholders, resolvePersonalizedTemplateText } from '../services/variableResolution.service.js';

const KEY_REGEX = /^[a-z][a-z0-9_]{1,62}$/;

const BUILTIN_CATALOG = [
  { key: 'current_date', label: "Today's date", category: 'SYSTEM', namespace: 'current_date', readOnly: true },
  { key: 'current_time', label: "Current time", category: 'SYSTEM', namespace: 'current_time', readOnly: true },
  {
    key: 'business_name',
    label: 'Business display name (Settings → client profile)',
    category: 'BUSINESS',
    namespace: 'business.name',
    readOnly: true,
  },
  {
    key: 'business_phone',
    label: 'Business phone — customer-facing (Settings → client profile)',
    category: 'BUSINESS',
    namespace: 'business.phone',
    readOnly: true,
  },
  {
    key: 'business_owner_name',
    label: 'Owner / public name (Settings → client profile)',
    category: 'BUSINESS',
    namespace: 'business.owner_name',
    readOnly: true,
  },
  {
    key: 'business_support_number',
    label: 'Support number (Settings → client profile)',
    category: 'BUSINESS',
    namespace: 'business.support_number',
    readOnly: true,
  },
  {
    key: 'wallet_balance',
    label: 'WAPilot wallet balance (₹)',
    category: 'PAYMENT',
    namespace: 'business.wallet.balance',
    readOnly: true,
  },
  {
    key: 'total_wallet_spent',
    label: 'Total spent from wallet (message charges, ₹)',
    category: 'PAYMENT',
    namespace: 'business.wallet.total_spent',
    readOnly: true,
  },
  {
    key: 'last_recharge_amount',
    label: 'Last successful wallet top-up amount (₹)',
    category: 'PAYMENT',
    namespace: 'business.wallet.last_recharge',
    readOnly: true,
  },
  {
    key: 'current_plan',
    label: 'Subscription plan (Basic / Pro)',
    category: 'PAYMENT',
    namespace: 'business.subscription.plan',
    readOnly: true,
  },
  {
    key: 'subscription_expiry',
    label: 'Subscription expiry date',
    category: 'PAYMENT',
    namespace: 'business.subscription.expiry',
    readOnly: true,
  },
  { key: 'customer_name', label: 'Customer name', category: 'CUSTOMER', namespace: 'customer.name', readOnly: true },
  { key: 'customer_phone', label: 'Customer phone', category: 'CUSTOMER', namespace: 'customer.phone', readOnly: true },
  {
    key: 'customer_email',
    label: 'Customer email (when available)',
    category: 'CUSTOMER',
    namespace: 'customer.email',
    readOnly: true,
  },
  {
    key: 'current_appointment_date',
    label: 'Current appointment — date',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.date',
    readOnly: true,
  },
  {
    key: 'current_appointment_time',
    label: 'Current appointment — time / slot text',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.time',
    readOnly: true,
  },
  {
    key: 'current_service_name',
    label: 'Current appointment — service',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.service_name',
    readOnly: true,
  },
  {
    key: 'current_staff_name',
    label: 'Current appointment — staff (reserved)',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.staff_name',
    readOnly: true,
  },
  {
    key: 'current_booking_id',
    label: 'Current appointment — booking reference',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.booking_id',
    readOnly: true,
  },
  {
    key: 'current_booking_status',
    label: 'Current appointment — status',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.booking_status',
    readOnly: true,
  },
  {
    key: 'current_booking_amount',
    label: 'Current appointment — amount (when linked in product)',
    category: 'APPOINTMENT',
    namespace: 'appointment.current.booking_amount',
    readOnly: true,
  },
  {
    key: 'last_appointment_date',
    label: 'Previous confirmed appointment — date',
    category: 'APPOINTMENT',
    namespace: 'appointment.last.date',
    readOnly: true,
  },
  {
    key: 'last_service_name',
    label: 'Previous confirmed appointment — service',
    category: 'APPOINTMENT',
    namespace: 'appointment.last.service_name',
    readOnly: true,
  },
  {
    key: 'last_staff_name',
    label: 'Previous appointment — staff (reserved)',
    category: 'APPOINTMENT',
    namespace: 'appointment.last.staff_name',
    readOnly: true,
  },
  {
    key: 'last_booking_amount',
    label: 'Previous appointment — amount (reserved)',
    category: 'APPOINTMENT',
    namespace: 'appointment.last.booking_amount',
    readOnly: true,
  },
  {
    key: 'next_appointment_date',
    label: 'Next pending appointment — date',
    category: 'APPOINTMENT',
    namespace: 'appointment.next.date',
    readOnly: true,
  },
  {
    key: 'next_service_name',
    label: 'Next pending appointment — service',
    category: 'APPOINTMENT',
    namespace: 'appointment.next.service_name',
    readOnly: true,
  },
  {
    key: 'last_payment_amount',
    label: 'Customer — last payment amount (₹)',
    category: 'PAYMENT',
    namespace: 'payment.last.amount',
    readOnly: true,
  },
  {
    key: 'last_payment_date',
    label: 'Customer — last payment date',
    category: 'PAYMENT',
    namespace: 'payment.last.date',
    readOnly: true,
  },
  {
    key: 'total_amount_paid',
    label: 'Customer — total paid (all successful customer payments, ₹)',
    category: 'PAYMENT',
    namespace: 'payment.customer.total_paid',
    readOnly: true,
  },
  {
    key: 'pending_amount',
    label: 'Customer — total pending (₹)',
    category: 'PAYMENT',
    namespace: 'payment.pending.amount',
    readOnly: true,
  },
  {
    key: 'payment_status',
    label: 'Customer — latest payment record status',
    category: 'PAYMENT',
    namespace: 'payment.status',
    readOnly: true,
  },
  {
    key: 'payment_method',
    label: 'Customer — latest payment provider / method',
    category: 'PAYMENT',
    namespace: 'payment.method',
    readOnly: true,
  },
  {
    key: 'name',
    label: 'Alias of customer_name (legacy)',
    category: 'CUSTOMER',
    namespace: 'customer.name',
    readOnly: true,
  },
  {
    key: 'phone',
    label: 'Alias of customer_phone (legacy)',
    category: 'CUSTOMER',
    namespace: 'customer.phone',
    readOnly: true,
  },
  {
    key: 'owner_name',
    label: 'Alias of business_owner_name (legacy)',
    category: 'BUSINESS',
    namespace: 'business.owner_name',
    readOnly: true,
  },
  {
    key: 'support_number',
    label: 'Alias of business_support_number (legacy)',
    category: 'BUSINESS',
    namespace: 'business.support_number',
    readOnly: true,
  },
];

function builtinsByCategory() {
  /** @type {Record<string, typeof BUILTIN_CATALOG>} */
  const out = {};
  for (const b of BUILTIN_CATALOG) {
    const c = b.category || 'SYSTEM';
    if (!out[c]) out[c] = [];
    out[c].push(b);
  }
  return out;
}

function normalizePhone(raw) {
  const only = String(raw || '')
    .trim()
    .replace(/[^\d+]/g, '');
  if (!only) return '';
  if (only.startsWith('+')) return only;
  return `+${only}`;
}

function validateCustomKey(key) {
  const k = String(key || '').trim().toLowerCase();
  if (!KEY_REGEX.test(k)) {
    return {
      ok: false,
      error:
        'Key must be snake_case: start with a letter, then letters, digits, or underscores (2–63 chars).',
    };
  }
  if (RESERVED_ENGINE_KEYS.has(k)) {
    return { ok: false, error: `Key "${k}" is reserved for built-in fields.` };
  }
  return { ok: true, key: k };
}

export async function getCatalog(_req, res, next) {
  try {
    res.json({
      builtins: BUILTIN_CATALOG,
      builtinsByCategory: builtinsByCategory(),
      futureCategories: ['CAMPAIGN', 'AI'],
      resolutionOrder: [
        'Send overrides',
        'Built-in / computed context',
        'Custom customer value',
        'Business field default',
        'Empty',
      ],
    });
  } catch (e) {
    next(e);
  }
}

export async function listDefinitions(req, res, next) {
  try {
    const rows = await prisma.variableDefinition.findMany({
      where: { businessId: req.user.businessId },
      orderBy: [{ type: 'asc' }, { key: 'asc' }],
    });
    res.json({ definitions: rows });
  } catch (e) {
    next(e);
  }
}

export async function createDefinition(req, res, next) {
  try {
    const { key, label, type, description = '', defaultValue = '', isEditable = true } = req.body || {};
    const v = validateCustomKey(key);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'label is required' });
    }
    if (type !== 'BUSINESS' && type !== 'CUSTOMER') {
      return res.status(400).json({ error: 'type must be BUSINESS or CUSTOMER' });
    }

    const created = await prisma.variableDefinition.create({
      data: {
        businessId: req.user.businessId,
        key: v.key,
        label: label.trim(),
        type,
        description: String(description || ''),
        defaultValue: String(defaultValue ?? ''),
        isEditable: Boolean(isEditable),
      },
    });
    res.status(201).json({ definition: created });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'A field with this key already exists.' });
    }
    next(e);
  }
}

export async function updateDefinition(req, res, next) {
  try {
    const { id } = req.params;
    const { label, description, defaultValue, isEditable } = req.body || {};

    const existing = await prisma.variableDefinition.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!existing) return res.status(404).json({ error: 'Field not found' });
    if (!existing.isEditable) {
      return res.status(400).json({ error: 'This field is not editable.' });
    }

    const data = {};
    if (label !== undefined) data.label = String(label).trim();
    if (description !== undefined) data.description = String(description);
    if (defaultValue !== undefined) data.defaultValue = String(defaultValue);
    if (isEditable !== undefined) data.isEditable = Boolean(isEditable);

    const updated = await prisma.variableDefinition.update({
      where: { id: existing.id },
      data,
    });
    res.json({ definition: updated });
  } catch (e) {
    next(e);
  }
}

export async function deleteDefinition(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.variableDefinition.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!existing) return res.status(404).json({ error: 'Field not found' });

    await prisma.variableDefinition.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function getCustomerValues(req, res, next) {
  try {
    const { customerId } = req.params;
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId: req.user.businessId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const [defs, vals] = await Promise.all([
      prisma.variableDefinition.findMany({
        where: { businessId: req.user.businessId, type: 'CUSTOMER' },
      }),
      prisma.customerVariableValue.findMany({
        where: { customerId },
        include: { definition: true },
      }),
    ]);

    const byKey = {};
    for (const d of defs) {
      byKey[d.key] = d.defaultValue ?? '';
    }
    for (const v of vals) {
      if (v.definition?.key) byKey[v.definition.key] = v.value ?? '';
    }

    res.json({ customerId, values: byKey });
  } catch (e) {
    next(e);
  }
}

export async function patchCustomerValues(req, res, next) {
  try {
    const { customerId } = req.params;
    const { values = {} } = req.body || {};

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId: req.user.businessId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const defs = await prisma.variableDefinition.findMany({
      where: { businessId: req.user.businessId, type: 'CUSTOMER' },
    });
    const defByKey = new Map(defs.map((d) => [d.key.toLowerCase(), d]));

    for (const [rawKey, rawVal] of Object.entries(values)) {
      const k = String(rawKey || '').trim().toLowerCase();
      const def = defByKey.get(k);
      if (!def) continue;
      const str = rawVal === undefined || rawVal === null ? '' : String(rawVal);
      await prisma.customerVariableValue.upsert({
        where: {
          customerId_variableDefinitionId: {
            customerId,
            variableDefinitionId: def.id,
          },
        },
        create: {
          customerId,
          variableDefinitionId: def.id,
          value: str,
        },
        update: { value: str },
      });
    }

    const nextVals = await prisma.customerVariableValue.findMany({
      where: { customerId },
      include: { definition: true },
    });
    const byKey = {};
    for (const d of defs) byKey[d.key] = d.defaultValue ?? '';
    for (const v of nextVals) {
      if (v.definition?.key) byKey[v.definition.key] = v.value ?? '';
    }

    res.json({ customerId, values: byKey });
  } catch (e) {
    next(e);
  }
}

function parseCsvLoose(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const o = {};
    headers.forEach((h, i) => {
      o[h] = cells[i] ?? '';
    });
    return o;
  });
  return { headers, rows };
}

const MAX_VARIABLE_CSV_BYTES = Number(process.env.MAX_VARIABLE_CSV_BYTES || 512 * 1024); // 512 KB
const MAX_VARIABLE_CSV_ROWS = Number(process.env.MAX_VARIABLE_CSV_ROWS || 5_000);

export async function importCustomerVariablesCsv(req, res, next) {
  try {
    const { csvText, phoneColumn = 'phone', variableColumns = [] } = req.body || {};
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ error: 'csvText is required' });
    }
    if (Buffer.byteLength(csvText) > MAX_VARIABLE_CSV_BYTES) {
      return res.status(413).json({
        error: `csvText exceeds the maximum allowed size of ${Math.round(MAX_VARIABLE_CSV_BYTES / 1024)} KB`,
      });
    }
    const cols = Array.isArray(variableColumns) ? variableColumns.map((c) => String(c).trim().toLowerCase()) : [];
    if (!cols.length) {
      return res.status(400).json({ error: 'variableColumns must list at least one CUSTOMER field key.' });
    }

    const phoneKey = String(phoneColumn || 'phone').trim().toLowerCase();
    const { rows } = parseCsvLoose(csvText);
    if (!rows.length) return res.status(400).json({ error: 'No data rows in CSV.' });
    if (rows.length > MAX_VARIABLE_CSV_ROWS) {
      return res.status(400).json({
        error: `CSV contains ${rows.length} rows; maximum allowed per request is ${MAX_VARIABLE_CSV_ROWS}`,
      });
    }

    const defs = await prisma.variableDefinition.findMany({
      where: { businessId: req.user.businessId, type: 'CUSTOMER', key: { in: cols } },
    });
    if (!defs.length) {
      return res.status(400).json({ error: 'No matching CUSTOMER field definitions for given keys.' });
    }
    const defByKey = new Map(defs.map((d) => [d.key.toLowerCase(), d]));

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const phone = normalizePhone(row[phoneKey]);
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        skipped += 1;
        continue;
      }
      const nameCol = row.name || row.customer_name || row.full_name || '';
      const customer = await prisma.customer.upsert({
        where: {
          businessId_phone: { businessId: req.user.businessId, phone },
        },
        update: nameCol ? { name: String(nameCol).slice(0, 200) } : {},
        create: {
          businessId: req.user.businessId,
          phone,
          name: nameCol ? String(nameCol).slice(0, 200) : null,
        },
      });

      let rowUpdated = false;
      for (const col of cols) {
        const def = defByKey.get(col);
        if (!def || !Object.prototype.hasOwnProperty.call(row, col)) continue;
        // Escape CSV formula injection: cells starting with =, +, @, - can execute in Excel/Sheets.
        const raw = row[col] === undefined || row[col] === null ? '' : String(row[col]);
        const val = /^[=+@\-]/.test(raw) ? `'${raw}` : raw;
        await prisma.customerVariableValue.upsert({
          where: {
            customerId_variableDefinitionId: {
              customerId: customer.id,
              variableDefinitionId: def.id,
            },
          },
          create: {
            customerId: customer.id,
            variableDefinitionId: def.id,
            value: val,
          },
          update: { value: val },
        });
        rowUpdated = true;
      }
      if (rowUpdated) updated += 1;
      else skipped += 1;
    }

    res.json({ ok: true, rowsProcessed: rows.length, customersUpdated: updated, skipped });
  } catch (e) {
    next(e);
  }
}

async function assertTemplate(req, id) {
  return prisma.template.findFirst({
    where: { id, businessId: req.user.businessId },
  });
}

export async function getTemplatePlaceholders(req, res, next) {
  try {
    const t = await assertTemplate(req, req.params.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    const extracted = extractTemplatePlaceholders(t.content);
    const mappings = await prisma.templateVariableMapping.findMany({
      where: { templateId: t.id },
      orderBy: { placeholderIndex: 'asc' },
    });
    res.json({ templateId: t.id, extracted, mappings });
  } catch (e) {
    next(e);
  }
}

export async function getVariableMappings(req, res, next) {
  try {
    const t = await assertTemplate(req, req.params.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    const mappings = await prisma.templateVariableMapping.findMany({
      where: { templateId: t.id },
      orderBy: { placeholderIndex: 'asc' },
    });
    res.json({ templateId: t.id, mappings });
  } catch (e) {
    next(e);
  }
}

export async function putVariableMappings(req, res, next) {
  try {
    const t = await assertTemplate(req, req.params.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    const { mappings = [] } = req.body || {};
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'mappings must be an array' });
    }

    const seen = new Set();
    for (const m of mappings) {
      const idx = Number(m.placeholderIndex);
      if (!Number.isFinite(idx) || idx < 1) {
        return res.status(400).json({ error: 'Each mapping needs placeholderIndex >= 1' });
      }
      if (seen.has(idx)) return res.status(400).json({ error: `Duplicate placeholderIndex ${idx}` });
      seen.add(idx);
      if (!m.variableKey || typeof m.variableKey !== 'string') {
        return res.status(400).json({ error: 'Each mapping needs variableKey' });
      }
      const ck = canonicalizeVariableKey(String(m.variableKey).trim());
      if (!ck) return res.status(400).json({ error: 'Each mapping needs a non-empty variableKey' });
    }

    await prisma.$transaction([
      prisma.templateVariableMapping.deleteMany({ where: { templateId: t.id } }),
      prisma.templateVariableMapping.createMany({
        data: mappings.map((m) => ({
          templateId: t.id,
          placeholderIndex: Number(m.placeholderIndex),
          variableKey: canonicalizeVariableKey(String(m.variableKey).trim()),
        })),
      }),
    ]);

    const next = await prisma.templateVariableMapping.findMany({
      where: { templateId: t.id },
      orderBy: { placeholderIndex: 'asc' },
    });
    res.json({ templateId: t.id, mappings: next });
  } catch (e) {
    next(e);
  }
}

export async function previewTemplate(req, res, next) {
  try {
    const t = await assertTemplate(req, req.params.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    const { customerId = null, contactName = null, contactPhone = null, overrides = {} } = req.body || {};

    const text = await resolvePersonalizedTemplateText({
      businessId: req.user.businessId,
      template: t,
      extraVariables: overrides,
      customerId,
      contactName,
      contactPhone,
    });

    res.json({ preview: text, templateId: t.id });
  } catch (e) {
    next(e);
  }
}
