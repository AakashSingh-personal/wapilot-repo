import { prisma } from '../lib/prisma.js';
import { configuredReminderChannels, isEmailConfigured, isSmsConfigured } from './notificationDelivery.service.js';

export const META_TEMPLATE_SUGGESTIONS = {
  reminder: {
    name: 'vartalap_appointment_reminder',
    category: 'UTILITY',
    language: 'en_US',
    body:
      'Reminder ({{4}}): Your {{1}} appointment is on {{2}}.\nRef: {{3}}\nReply RESCHEDULE or CANCEL to manage.',
    variables: ['service', 'when', 'ref', 'label'],
  },
  confirmation: {
    name: 'vartalap_appointment_confirmed',
    category: 'UTILITY',
    language: 'en_US',
    body: 'Booking confirmed!\n{{1}} on {{2}}\nRef: {{3}}',
    variables: ['service', 'when', 'ref'],
  },
  rebooking: {
    name: 'vartalap_rebooking_nudge',
    category: 'MARKETING',
    language: 'en_US',
    body:
      'Hi! Time for your next {{1}} at {{2}}.\nReply BOOK to schedule.',
    variables: ['service', 'business'],
  },
};

const DEFAULTS = {
  reminderTemplate: '',
  confirmationTemplate: '',
  rebookingTemplate: '',
  templateLang: 'en_US',
  reminderChannels: null,
  publicBookingEnabled: false,
  publicBookingCollectAdvance: false,
};

export async function getSchedulingSettings(businessId) {
  const cfg = await prisma.businessConfig.findUnique({
    where: { businessId },
    select: { schedulingSettings: true },
  });
  const stored =
    cfg?.schedulingSettings && typeof cfg.schedulingSettings === 'object'
      ? cfg.schedulingSettings
      : {};

  return {
    ...DEFAULTS,
    /** Per-business template names; env vars are platform fallbacks only when unset here. */
    reminderTemplate: stored.reminderTemplate || process.env.WHATSAPP_REMINDER_TEMPLATE || '',
    confirmationTemplate:
      stored.confirmationTemplate || process.env.WHATSAPP_CONFIRMATION_TEMPLATE || '',
    rebookingTemplate: stored.rebookingTemplate || process.env.WHATSAPP_REBOOKING_TEMPLATE || '',
    templateLang:
      stored.templateLang || process.env.WHATSAPP_SCHEDULING_TEMPLATE_LANG || 'en_US',
    reminderChannels: stored.reminderChannels || null,
    activeReminderChannels:
      Array.isArray(stored.reminderChannels) && stored.reminderChannels.length
        ? stored.reminderChannels.map((c) => String(c).toUpperCase())
        : configuredReminderChannels(),
    reminderChannelOptions: {
      whatsapp: true,
      email: isEmailConfigured(),
      sms: isSmsConfigured(),
    },
    publicBookingEnabled: Boolean(stored.publicBookingEnabled),
    publicBookingCollectAdvance: Boolean(stored.publicBookingCollectAdvance),
    metaTemplateSuggestions: META_TEMPLATE_SUGGESTIONS,
  };
}

export async function updateSchedulingSettings(businessId, patch) {
  const current = await getSchedulingSettings(businessId);
  const next = {
    reminderTemplate:
      patch.reminderTemplate !== undefined ? String(patch.reminderTemplate || '') : current.reminderTemplate,
    confirmationTemplate:
      patch.confirmationTemplate !== undefined
        ? String(patch.confirmationTemplate || '')
        : current.confirmationTemplate,
    rebookingTemplate:
      patch.rebookingTemplate !== undefined
        ? String(patch.rebookingTemplate || '')
        : current.rebookingTemplate,
    templateLang:
      patch.templateLang !== undefined ? String(patch.templateLang || 'en_US') : current.templateLang,
    reminderChannels: patch.reminderChannels !== undefined ? patch.reminderChannels : current.reminderChannels,
    publicBookingEnabled:
      patch.publicBookingEnabled !== undefined
        ? Boolean(patch.publicBookingEnabled)
        : current.publicBookingEnabled,
    publicBookingCollectAdvance:
      patch.publicBookingCollectAdvance !== undefined
        ? Boolean(patch.publicBookingCollectAdvance)
        : current.publicBookingCollectAdvance,
  };

  await prisma.businessConfig.upsert({
    where: { businessId },
    create: { businessId, schedulingSettings: next },
    update: { schedulingSettings: next },
  });

  return { ...next, metaTemplateSuggestions: META_TEMPLATE_SUGGESTIONS };
}

export async function getWhatsAppTemplatesForBusiness(businessId) {
  const s = await getSchedulingSettings(businessId);
  return {
    reminder: s.reminderTemplate,
    confirmation: s.confirmationTemplate,
    rebooking: s.rebookingTemplate,
    lang: s.templateLang,
  };
}
