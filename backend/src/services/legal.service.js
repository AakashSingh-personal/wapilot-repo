import { prisma } from '../lib/prisma.js';
import { DEFAULT_LEGAL_DOCUMENTS, LEGAL_SLUGS } from '../data/legalDefaults.js';
import { log } from '../utils/logger.js';

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];

  return sections.map((section) => ({
    title: String(section?.title || '').trim(),
    paragraphs: Array.isArray(section?.paragraphs)
      ? section.paragraphs.map((p) => String(p).trim()).filter(Boolean)
      : [],
    listItems: Array.isArray(section?.listItems)
      ? section.listItems.map((item) => String(item).trim()).filter(Boolean)
      : [],
    trailingParagraphs: Array.isArray(section?.trailingParagraphs)
      ? section.trailingParagraphs.map((p) => String(p).trim()).filter(Boolean)
      : [],
  })).filter((section) => section.title);
}

export function serializeLegalDocument(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    intro: doc.intro || '',
    sections: normalizeSections(doc.sections),
    published: doc.published,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

export async function ensureLegalDefaults() {
  for (const defaults of DEFAULT_LEGAL_DOCUMENTS) {
    await prisma.legalDocument.upsert({
      where: { slug: defaults.slug },
      update: {},
      create: {
        slug: defaults.slug,
        title: defaults.title,
        intro: defaults.intro,
        sections: normalizeSections(defaults.sections),
        published: defaults.published,
      },
    });
  }
}

export function isValidLegalSlug(slug) {
  return LEGAL_SLUGS.includes(slug);
}

function getStaticLegalDocument(slug) {
  const defaults = DEFAULT_LEGAL_DOCUMENTS.find((d) => d.slug === slug);
  if (!defaults || defaults.published === false) return null;
  const now = new Date();
  return serializeLegalDocument({
    ...defaults,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getPublicLegalDocument(slug) {
  if (!isValidLegalSlug(slug)) return null;

  try {
    await ensureLegalDefaults();
    const doc = await prisma.legalDocument.findUnique({ where: { slug } });
    if (!doc || !doc.published) return getStaticLegalDocument(slug);
    return serializeLegalDocument(doc);
  } catch (err) {
    log('warn', 'legal_db_unavailable', { slug, message: err.message });
    return getStaticLegalDocument(slug);
  }
}

export async function listLegalDocuments() {
  await ensureLegalDefaults();

  const docs = await prisma.legalDocument.findMany({
    orderBy: { slug: 'asc' },
  });

  return docs.map(serializeLegalDocument);
}

export async function getLegalDocument(slug) {
  await ensureLegalDefaults();

  const doc = await prisma.legalDocument.findUnique({ where: { slug } });
  if (!doc) return null;

  return serializeLegalDocument(doc);
}

export async function updateLegalDocument(slug, payload, updatedById) {
  if (!isValidLegalSlug(slug)) {
    const error = new Error('Invalid legal document slug');
    error.status = 400;
    throw error;
  }

  const title = String(payload?.title || '').trim();
  if (!title) {
    const error = new Error('Title is required');
    error.status = 400;
    throw error;
  }

  const sections = normalizeSections(payload?.sections);
  if (!sections.length) {
    const error = new Error('At least one section is required');
    error.status = 400;
    throw error;
  }

  await ensureLegalDefaults();

  const doc = await prisma.legalDocument.update({
    where: { slug },
    data: {
      title,
      intro: payload?.intro ? String(payload.intro).trim() : null,
      sections,
      published: payload?.published !== false,
      updatedById: updatedById || null,
    },
  });

  return serializeLegalDocument(doc);
}
