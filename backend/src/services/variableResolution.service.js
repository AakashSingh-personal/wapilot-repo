import { prisma } from '../lib/prisma.js';
import {
  buildTemplateContext,
  canonicalizeVariableKey,
  RESERVED_ENGINE_KEYS,
} from './dynamicFieldEngine.service.js';

/** @deprecated use RESERVED_ENGINE_KEYS — kept for imports */
export const RESERVED_VARIABLE_KEYS = RESERVED_ENGINE_KEYS;

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

  const [mappings, definitions, customerValues, context] = await Promise.all([
    prisma.templateVariableMapping.findMany({
      where: { templateId: template.id },
      orderBy: { placeholderIndex: 'asc' },
    }),
    prisma.variableDefinition.findMany({ where: { businessId } }),
    customerId
      ? prisma.customerVariableValue.findMany({
          where: { customerId },
        })
      : [],
    buildTemplateContext({
      businessId,
      customerId,
      contactName,
      contactPhone,
    }),
  ]);

  const definitionByKey = new Map(
    definitions.map((d) => [canonicalizeVariableKey(d.key), d]),
  );
  const valueByDefId = new Map(
    customerValues.map((v) => [v.variableDefinitionId, v.value]),
  );
  const indexToVariableKey = new Map(
    mappings.map((m) => [m.placeholderIndex, canonicalizeVariableKey(m.variableKey)]),
  );

  const overrides = {};
  for (const [k, v] of Object.entries(extraVariables || {})) {
    const ck = canonicalizeVariableKey(k);
    if (!ck) continue;
    overrides[ck] = v === undefined || v === null ? '' : String(v);
  }

  const resolveKey = (rawKey) => {
    const k = canonicalizeVariableKey(rawKey);
    if (!k) return '';

    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      return overrides[k];
    }

    if (RESERVED_ENGINE_KEYS.has(k)) {
      return context[k] ?? '';
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
