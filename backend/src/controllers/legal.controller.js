import {
  getLegalDocument,
  getPublicLegalDocument,
  listLegalDocuments,
  updateLegalDocument,
} from '../services/legal.service.js';

export async function getPublicLegal(req, res, next) {
  try {
    const { slug } = req.params;
    const doc = await getPublicLegalDocument(slug);
    if (!doc) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listAdminLegal(req, res, next) {
  try {
    const docs = await listLegalDocuments();
    res.json({ documents: docs });
  } catch (e) {
    next(e);
  }
}

export async function getAdminLegal(req, res, next) {
  try {
    const { slug } = req.params;
    const doc = await getLegalDocument(slug);
    if (!doc) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateAdminLegal(req, res, next) {
  try {
    const { slug } = req.params;
    const doc = await updateLegalDocument(slug, req.body || {}, req.user?.userId);
    res.json(doc);
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    next(e);
  }
}
