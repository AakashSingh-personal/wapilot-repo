import { prisma } from '../lib/prisma.js';

export async function getConfig(req, res, next) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      include: { config: true },
    });
    res.json({
      business: { id: business.id, name: business.name, phoneNumberId: business.phoneNumberId },
      config: business.config,
    });
  } catch (e) {
    next(e);
  }
}

export async function updateConfig(req, res, next) {
  try {
    const { businessName, services, workingHours, autoReplyEnabled, upiId, phoneNumberId } =
      req.body || {};

    await prisma.$transaction(async (tx) => {
      const data = {};
      if (businessName != null) data.name = businessName;
      if (phoneNumberId !== undefined) {
        data.phoneNumberId =
          phoneNumberId !== null && String(phoneNumberId).trim() !== ''
            ? String(phoneNumberId).trim()
            : null;
      }

      if (Object.keys(data).length) {
        await tx.business.update({
          where: { id: req.user.businessId },
          data,
        });
      }

      const cfgData = {};
      if (services != null) cfgData.services = services;
      if (workingHours != null) cfgData.workingHours = workingHours;
      if (autoReplyEnabled != null) cfgData.autoReplyEnabled = Boolean(autoReplyEnabled);
      if (upiId !== undefined) cfgData.upiId = upiId;

      if (Object.keys(cfgData).length) {
        await tx.businessConfig.upsert({
          where: { businessId: req.user.businessId },
          create: {
            businessId: req.user.businessId,
            services: services ?? [],
            workingHours: typeof workingHours === 'string' ? workingHours : JSON.stringify({ slots: ['3 PM', '5 PM'] }),
            autoReplyEnabled: autoReplyEnabled ?? true,
            upiId: upiId ?? null,
          },
          update: cfgData,
        });
      }
    });

    const fresh = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      include: { config: true },
    });
    res.json({
      business: { id: fresh.id, name: fresh.name, phoneNumberId: fresh.phoneNumberId },
      config: fresh.config,
    });
  } catch (e) {
    next(e);
  }
}
