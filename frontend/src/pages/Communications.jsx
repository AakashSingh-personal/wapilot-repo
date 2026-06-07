import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { subscribeRealtime } from '../realtime/socket.js';
import {
  Wallet as WalletIcon, Send as SendIcon, FileText, Variable, Users, BookOpen,
  Plus, Trash2, RefreshCw, Copy, Edit3, AlertCircle, CheckCircle2,
  ChevronDown, ArrowRight, Loader2,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Checkbox } from '../components/ui/Checkbox.jsx';

// ── helpers ───────────────────────────────────────────────────────────────

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function metaStatusBadgeClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'APPROVED') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (normalized === 'PENDING' || normalized === 'IN_REVIEW') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (normalized === 'REJECTED') return 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
}

const BUILTIN_CATEGORY_ORDER = ['SYSTEM', 'BUSINESS', 'CUSTOMER', 'APPOINTMENT', 'PAYMENT'];

function insertAtCursor(textareaRef, snippet, setValue) {
  const el = textareaRef?.current;
  if (!el) { setValue((prev) => String(prev || '') + snippet); return; }
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
  const v = el.value;
  const next = v.slice(0, start) + snippet + v.slice(end);
  flushSync(() => { setValue(next); });
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + snippet.length;
    try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
  });
}

function displayMetaStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (!normalized) return 'NOT_FOUND';
  if (normalized === 'PENDING') return 'IN_REVIEW';
  return normalized;
}

const META_LIMITS = {
  BODY_MAX: 1024,
  HEADER_TEXT_MAX: 60,
  FOOTER_TEXT_MAX: 60,
  BUTTON_TEXT_MAX: 25,
  TOTAL_BUTTONS_MAX: 10,
  URL_BUTTONS_MAX: 2,
  PHONE_BUTTONS_MAX: 1,
};

const inputCls =
  'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-colors';

// ── component ─────────────────────────────────────────────────────────────

export default function Communications({ forcedTab = null, templateMode = 'combined' }) {
  const params = useParams();
  const editTemplateId = templateMode === 'edit' ? params.templateId : null;
  const TXN_PAGE_SIZE = 20;
  const tabs = ['WALLET', 'SEND', 'TEMPLATES', 'FIELDS', 'CONTACTS', 'CONTACT_BOOK'];
  const tabMeta = {
    WALLET: { title: 'Wallet', subtitle: 'Check balance, add money, and review wallet transactions.' },
    SEND: { title: 'Send Communication', subtitle: 'Send approved templates to one contact or in bulk.' },
    TEMPLATES: { title: 'Templates', subtitle: 'Create templates, review status, and sync updates from Meta.' },
    FIELDS: { title: 'Personalization fields', subtitle: 'Business-wide and per-customer values. Map Meta {{1}} placeholders to friendly keys.' },
    CONTACTS: { title: 'Upload Contacts', subtitle: 'Upload contact CSV data for campaign and bulk communication.' },
    CONTACT_BOOK: { title: 'Contact Book', subtitle: 'View uploaded contacts with payments and booking history.' },
  };

  const [wallet, setWallet] = useState(null);
  const [walletTxns, setWalletTxns] = useState([]);
  const [txnFilter, setTxnFilter] = useState('ALL');
  const [txnOnlyTopups, setTxnOnlyTopups] = useState(false);
  const [txnOffset, setTxnOffset] = useState(0);
  const [txnHasMore, setTxnHasMore] = useState(false);
  const [txnLoading, setTxnLoading] = useState(false);
  const [messageCost, setMessageCost] = useState(2);
  const [contacts, setContacts] = useState([]);
  const [contactBookRows, setContactBookRows] = useState([]);
  const [contactBookLoading, setContactBookLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tabFeedback, setTabFeedback] = useState(() =>
    tabs.reduce((acc, tab) => { acc[tab] = { error: '', info: '' }; return acc; }, {}),
  );
  const [addAmount, setAddAmount] = useState('');
  const [addingMoney, setAddingMoney] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templateCategory, setTemplateCategory] = useState('MARKETING');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [includeHeader, setIncludeHeader] = useState(false);
  const [headerFormat, setHeaderFormat] = useState('TEXT');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaUploading, setHeaderMediaUploading] = useState(false);
  const [includeFooter, setIncludeFooter] = useState(false);
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState([]);
  const [templateValidationErrors, setTemplateValidationErrors] = useState([]);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [savingEditTemplate, setSavingEditTemplate] = useState(false);
  const [editingTemplateLoading, setEditingTemplateLoading] = useState(false);
  const [uploadingContactsLoading, setUploadingContactsLoading] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState('');
  const [metaTemplateOptions, setMetaTemplateOptions] = useState({
    categories: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
    languages: ['en_US'],
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedBulk, setSelectedBulk] = useState({});
  const [sending, setSending] = useState(false);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [builtins, setBuiltins] = useState([]);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('BUSINESS');
  const [newFieldDefault, setNewFieldDefault] = useState('');
  const [fieldsCsvPaste, setFieldsCsvPaste] = useState('');
  const [fieldsPhoneCol, setFieldsPhoneCol] = useState('phone');
  const [fieldsVarCols, setFieldsVarCols] = useState('');
  const [fieldsSaving, setFieldsSaving] = useState(false);
  const [mappingModalId, setMappingModalId] = useState('');
  const [mappingRows, setMappingRows] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [sendPreview, setSendPreview] = useState('');
  const [cloneSource, setCloneSource] = useState(null);
  const [cloneNewName, setCloneNewName] = useState('');
  const [cloneOnMeta, setCloneOnMeta] = useState(false);
  const [cloneSubmitting, setCloneSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(forcedTab || 'WALLET');
  const navigate = useNavigate();
  const templateBodyRef = useRef(null);

  useEffect(() => {
    if (forcedTab && tabs.includes(forcedTab)) setActiveTab(forcedTab);
  }, [forcedTab]);

  const error = tabFeedback[activeTab]?.error || '';
  const info = tabFeedback[activeTab]?.info || '';
  const setError = (message, tab = activeTab) => {
    setTabFeedback((prev) => ({
      ...prev,
      [tab]: { ...(prev[tab] || { error: '', info: '' }), error: message || '' },
    }));
  };
  const setInfo = (message, tab = activeTab) => {
    setTabFeedback((prev) => ({
      ...prev,
      [tab]: { ...(prev[tab] || { error: '', info: '' }), info: message || '' },
    }));
  };

  const headerMeta = tabMeta[activeTab] || {
    title: 'Communications',
    subtitle: 'Upload contacts, manage templates, and send single or bulk communications.',
  };

  const selectedTemplate = useMemo(
    () => asArray(templates).find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (activeTab !== 'SEND') { setSendPreview(''); return; }
    if (!selectedTemplateId || bulkMode) { setSendPreview(''); return; }
    const cid = selectedContactId;
    if (!cid) { setSendPreview(''); return; }
    const c = contacts.find((x) => x.id === cid);
    if (!c) { setSendPreview(''); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post(`/templates/${selectedTemplateId}/preview`, {
          contactName: c.name,
          contactPhone: c.phone,
        });
        if (!cancelled) setSendPreview(String(data?.preview || ''));
      } catch { if (!cancelled) setSendPreview(''); }
    })();
    return () => { cancelled = true; };
  }, [activeTab, selectedTemplateId, selectedContactId, bulkMode, contacts]);

  const builderValidationErrors = useMemo(() => {
    const errs = [];
    const body = templateContent.trim();
    if (!templateName.trim()) errs.push('Template name is required');
    if (!body) errs.push('Body text is required');
    if (body.length > META_LIMITS.BODY_MAX) errs.push(`Body text must be ${META_LIMITS.BODY_MAX} characters or less`);
    if (includeHeader && headerFormat === 'TEXT') {
      const h = headerText.trim();
      if (!h) errs.push('Header text is required for TEXT header');
      if (h.length > META_LIMITS.HEADER_TEXT_MAX) errs.push(`Header text must be ${META_LIMITS.HEADER_TEXT_MAX} characters or less`);
    }
    if (includeFooter && footerText.trim().length > META_LIMITS.FOOTER_TEXT_MAX) {
      errs.push(`Footer text must be ${META_LIMITS.FOOTER_TEXT_MAX} characters or less`);
    }
    if (buttons.length > META_LIMITS.TOTAL_BUTTONS_MAX) errs.push(`Total buttons cannot exceed ${META_LIMITS.TOTAL_BUTTONS_MAX}`);
    const urlCount = buttons.filter((b) => b.type === 'URL').length;
    const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
    if (urlCount > META_LIMITS.URL_BUTTONS_MAX) errs.push(`URL buttons cannot exceed ${META_LIMITS.URL_BUTTONS_MAX}`);
    if (phoneCount > META_LIMITS.PHONE_BUTTONS_MAX) errs.push(`Phone number buttons cannot exceed ${META_LIMITS.PHONE_BUTTONS_MAX}`);
    buttons.forEach((b, idx) => {
      const label = `Button ${idx + 1}`;
      const text = (b.text || '').trim();
      if (!text) errs.push(`${label}: text is required`);
      if (text.length > META_LIMITS.BUTTON_TEXT_MAX) errs.push(`${label}: text must be ${META_LIMITS.BUTTON_TEXT_MAX} characters or less`);
      if (b.type === 'URL') {
        const url = (b.url || '').trim();
        if (!url) errs.push(`${label}: URL is required`);
        else if (!/^https?:\/\/\S+$/i.test(url)) errs.push(`${label}: URL must start with http:// or https://`);
      }
      if (b.type === 'PHONE_NUMBER') {
        const pn = (b.phoneNumber || '').trim();
        if (!pn) errs.push(`${label}: phone number is required`);
        else if (!/^\+?[1-9]\d{7,14}$/.test(pn.replace(/\s+/g, ''))) errs.push(`${label}: phone number must be valid E.164 format`);
      }
    });
    return errs;
  }, [templateName, templateContent, includeHeader, headerFormat, headerText, includeFooter, footerText, buttons]);

  async function loadWalletTransactions({ filter = txnFilter, offset = 0, append = false, onlyTopups = txnOnlyTopups } = {}) {
    setTxnLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(TXN_PAGE_SIZE));
      params.set('offset', String(offset));
      if (filter !== 'ALL') params.set('type', filter);
      if (onlyTopups) params.set('source', 'TOPUP');
      const { data } = await api.get(`/wallet/transactions?${params.toString()}`);
      const rows = asArray(data?.rows);
      setWalletTxns((prev) => (append ? [...prev, ...rows] : rows));
      setTxnOffset(data?.nextOffset ?? offset + rows.length);
      setTxnHasMore(Boolean(data?.hasMore));
    } finally {
      setTxnLoading(false);
    }
  }

  async function refreshWallet() {
    const { data } = await api.get('/wallet');
    setWallet(data.wallet);
    setMessageCost(Number(data.messageCost || 2));
  }

  async function ensureWalletLoaded() { await refreshWallet(); }

  async function reloadContactsFromApi() {
    try {
      const { data } = await api.get('/contacts');
      const list = asArray(data);
      setContacts(list);
      setSelectedContactId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch { /* keep existing list */ }
  }

  async function reloadTemplatesFromApi() {
    try {
      const { data } = await api.get('/templates');
      const templatesData = asArray(data?.templates || data);
      setTemplates(templatesData);
      if (data?.metaSyncError) setError(`Meta sync issue: ${data.metaSyncError}`, 'TEMPLATES');
      setSelectedTemplateId((prev) => {
        if (prev && templatesData.some((t) => t.id === prev)) return prev;
        return templatesData[0]?.id || '';
      });
    } catch { /* keep existing templates */ }
  }

  async function loadPersonalizationCatalog() {
    const { data } = await api.get('/variables/catalog');
    setBuiltins(asArray(data?.builtins));
  }

  async function loadPersonalizationDefinitions() {
    const { data } = await api.get('/variables/definitions');
    setFieldDefs(asArray(data?.definitions));
  }

  async function createFieldDefinition() {
    setError('', 'FIELDS'); setInfo('', 'FIELDS'); setFieldsSaving(true);
    try {
      await api.post('/variables/definitions', {
        key: newFieldKey.trim(), label: newFieldLabel.trim(), type: newFieldType, defaultValue: newFieldDefault,
      });
      setNewFieldKey(''); setNewFieldLabel(''); setNewFieldDefault('');
      setInfo('Field created', 'FIELDS');
      await loadPersonalizationDefinitions();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create field', 'FIELDS');
    } finally { setFieldsSaving(false); }
  }

  async function deleteFieldDefinition(id) {
    if (!window.confirm('Delete this field? Customer values for it will be removed.')) return;
    setError('', 'FIELDS');
    try {
      await api.delete(`/variables/definitions/${id}`);
      setInfo('Field deleted', 'FIELDS');
      await loadPersonalizationDefinitions();
    } catch (e) { setError(e.response?.data?.error || 'Delete failed', 'FIELDS'); }
  }

  async function importFieldCsv() {
    setError('', 'FIELDS'); setInfo('', 'FIELDS');
    const cols = fieldsVarCols.split(',').map((s) => s.trim()).filter(Boolean);
    if (!cols.length) { setError('List variable column keys (comma-separated), matching CUSTOMER fields.', 'FIELDS'); return; }
    setFieldsSaving(true);
    try {
      const { data } = await api.post('/variables/import-csv', {
        csvText: fieldsCsvPaste, phoneColumn: fieldsPhoneCol.trim() || 'phone', variableColumns: cols,
      });
      setInfo(`Import done: ${data.customersUpdated} contact(s) updated, ${data.skipped} row(s) skipped.`, 'FIELDS');
      setFieldsCsvPaste('');
    } catch (e) { setError(e.response?.data?.error || 'Import failed', 'FIELDS'); }
    finally { setFieldsSaving(false); }
  }

  async function openMappingModal(templateId) {
    setMappingModalId(templateId); setMappingLoading(true); setError('', 'TEMPLATES');
    try {
      const [{ data: ph }, { data: mp }] = await Promise.all([
        api.get(`/templates/${templateId}/placeholders`),
        api.get(`/templates/${templateId}/variable-mappings`),
      ]);
      const numbered = asArray(ph?.extracted?.numbered);
      const existing = new Map(asArray(mp?.mappings).map((m) => [m.placeholderIndex, m.variableKey]));
      setMappingRows(numbered.map((n) => ({ placeholderIndex: n, variableKey: existing.get(n) || '' })));
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load placeholders', 'TEMPLATES');
      setMappingModalId('');
    } finally { setMappingLoading(false); }
  }

  async function saveTemplateMappings() {
    if (!mappingModalId) return;
    setMappingLoading(true);
    try {
      const mappings = mappingRows
        .filter((r) => r.variableKey && String(r.variableKey).trim())
        .map((r) => ({ placeholderIndex: r.placeholderIndex, variableKey: String(r.variableKey).trim() }));
      await api.put(`/templates/${mappingModalId}/variable-mappings`, { mappings });
      setInfo('Template field mapping saved', 'TEMPLATES');
      setMappingModalId('');
    } catch (e) { setError(e.response?.data?.error || 'Save failed', 'TEMPLATES'); }
    finally { setMappingLoading(false); }
  }

  const selectableVariableKeys = useMemo(() => {
    const s = new Set();
    builtins.forEach((b) => { s.add(b.key); if (b.namespace && b.namespace !== b.key) s.add(b.namespace); });
    fieldDefs.forEach((d) => s.add(d.key));
    return [...s].sort();
  }, [builtins, fieldDefs]);

  const builtinsByCategory = useMemo(() => {
    const m = {};
    builtins.forEach((b) => { const c = b.category || 'SYSTEM'; if (!m[c]) m[c] = []; m[c].push(b); });
    return m;
  }, [builtins]);

  function insertTemplateToken(rawKey) {
    const k = String(rawKey || '').trim();
    if (!k) return;
    insertAtCursor(templateBodyRef, `{{${k}}}`, setTemplateContent);
  }

  async function loadAll() {
    await refreshWallet();
    await reloadContactsFromApi();
    await reloadTemplatesFromApi();
    try { await loadContactBook(); } catch { /* Contact book is optional */ }
    await loadWalletTransactions({ filter: txnFilter, offset: 0, append: false, onlyTopups: txnOnlyTopups }).catch(() => {});
  }

  async function ensureContactsLoaded() {
    if (contacts.length) return;
    const { data } = await api.get('/contacts');
    const contactsData = asArray(data);
    setContacts(contactsData);
    setSelectedContactId((prev) => prev || contactsData?.[0]?.id || '');
  }

  async function ensureTemplatesLoaded() {
    if (templates.length) return;
    const { data } = await api.get('/templates');
    const templatesData = asArray(data?.templates || data);
    setTemplates(templatesData);
    if (data?.metaSyncError) setError(`Meta sync issue: ${data.metaSyncError}`, 'TEMPLATES');
    setSelectedTemplateId((prev) => prev || templatesData?.[0]?.id || '');
  }

  async function ensureMetaTemplateOptionsLoaded() {
    if (metaTemplateOptions?.categories?.length > 1 || metaTemplateOptions?.languages?.length > 1) return;
    const { data } = await api.get('/templates/meta-options').catch(() => ({ data: null }));
    if (data) setMetaTemplateOptions(data);
  }

  async function loadContactBook() {
    setContactBookLoading(true);
    try {
      const { data } = await api.get('/contacts/book');
      setContactBookRows(asArray(data?.rows));
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load contact book', 'CONTACT_BOOK');
    } finally { setContactBookLoading(false); }
  }

  async function deleteContact(id) {
    if (!id) return;
    const ok = window.confirm('Delete this contact?');
    if (!ok) return;
    setError('', 'CONTACT_BOOK'); setInfo('', 'CONTACT_BOOK');
    try {
      await api.delete(`/contacts/${id}`);
      setInfo('Contact deleted', 'CONTACT_BOOK');
      setContactBookRows((prev) => prev.filter((r) => r.id !== id));
      await loadContactBook();
    } catch (e) { setError(e.response?.data?.error || 'Failed to delete contact', 'CONTACT_BOOK'); }
  }

  useEffect(() => {
    return subscribeRealtime((evt) => {
      if (evt?.type === 'contacts_changed' && activeTab === 'CONTACT_BOOK') void loadContactBook();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (activeTab === 'WALLET') {
          await ensureWalletLoaded();
          if (!cancelled) await loadWalletTransactions({ filter: txnFilter, offset: 0, append: false, onlyTopups: txnOnlyTopups });
        } else if (activeTab === 'SEND') {
          await Promise.all([ensureWalletLoaded(), ensureContactsLoaded(), ensureTemplatesLoaded()]);
        } else if (activeTab === 'TEMPLATES') {
          await Promise.all([ensureTemplatesLoaded(), ensureMetaTemplateOptionsLoaded(), loadPersonalizationCatalog(), loadPersonalizationDefinitions()]);
        } else if (activeTab === 'FIELDS') {
          await Promise.all([loadPersonalizationCatalog(), loadPersonalizationDefinitions()]);
        } else if (activeTab === 'CONTACT_BOOK') {
          await loadContactBook();
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load communication data', activeTab);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, txnFilter, txnOnlyTopups]);

  useEffect(() => {
    if (templateMode !== 'edit' || !editTemplateId) return;
    let cancelled = false;
    setEditingTemplateLoading(true);
    (async () => {
      try {
        await ensureMetaTemplateOptionsLoaded();
        await loadPersonalizationCatalog();
        await loadPersonalizationDefinitions();
        const { data } = await api.get(`/templates/${editTemplateId}`);
        if (cancelled) return;
        const tpl = data.template;
        setTemplateName(tpl.name || '');
        const snap = tpl.metaSnapshot;
        if (snap?.category) setTemplateCategory(snap.category);
        if (snap?.language) setTemplateLanguage(snap.language);
        const comps = Array.isArray(snap?.components) ? snap.components : [];
        let bodyFromSnap = '';
        const snapButtons = [];
        let hasHeader = false;
        let hasFooter = false;
        for (const c of comps) {
          if (c.type === 'HEADER') {
            hasHeader = true;
            if (c.format === 'TEXT') { setHeaderFormat('TEXT'); setHeaderText(c.text || ''); }
            else { setHeaderFormat(c.format || 'IMAGE'); const h = c.example?.header_handle?.[0]; setHeaderMediaUrl(h || ''); }
          }
          if (c.type === 'BODY') bodyFromSnap = c.text || '';
          if (c.type === 'FOOTER') { hasFooter = true; setFooterText(c.text || ''); }
          if (c.type === 'BUTTONS' && Array.isArray(c.buttons)) {
            for (const b of c.buttons) {
              if (b.type === 'QUICK_REPLY') snapButtons.push({ id: crypto.randomUUID(), type: 'QUICK_REPLY', text: b.text || '', url: '', phoneNumber: '' });
              else if (b.type === 'URL') snapButtons.push({ id: crypto.randomUUID(), type: 'URL', text: b.text || '', url: b.url || '', phoneNumber: '' });
              else if (b.type === 'PHONE_NUMBER') snapButtons.push({ id: crypto.randomUUID(), type: 'PHONE_NUMBER', text: b.text || '', url: '', phoneNumber: b.phone_number || '' });
            }
          }
        }
        setIncludeHeader(hasHeader); setIncludeFooter(hasFooter);
        setTemplateContent(bodyFromSnap || tpl.content || '');
        setButtons(snapButtons);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load template', 'TEMPLATES');
      } finally {
        if (!cancelled) setEditingTemplateLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateMode, editTemplateId]);

  async function addMoney() {
    if (!addAmount) return;
    setError(''); setInfo(''); setAddingMoney(true);
    try {
      const scriptLoaded = await new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => resolve(true); s.onerror = () => resolve(false);
        document.body.appendChild(s);
      });
      if (!scriptLoaded) { setError('Could not load Razorpay checkout'); return; }
      const { data } = await api.post('/wallet/add-money', { amount: Number(addAmount) });
      const rzp = new window.Razorpay({
        key: data.keyId, amount: Math.round(Number(data.amount) * 100),
        currency: data.currency || 'INR', name: 'WAPilot', description: 'Wallet top-up',
        order_id: data.orderId,
        handler: async (resp) => {
          await api.patch(`/wallet/add-money/${data.paymentId}/verify`, {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          setAddAmount(''); await loadAll(); setInfo('Wallet updated');
        },
      });
      rzp.on('payment.failed', () => setError('Payment failed or cancelled'));
      rzp.open();
    } catch (e) { setError(e.response?.data?.error || 'Could not add money'); }
    finally { setAddingMoney(false); }
  }

  async function uploadContacts() {
    if (!csvText.trim()) return;
    setError(''); setInfo(''); setUploadingContactsLoading(true);
    try {
      const { data } = await api.post('/contacts/upload', { csvText });
      setCsvText(''); setError('');
      const n = Number(data?.inserted ?? 0);
      setInfo(n > 0 ? `Uploaded contacts: ${n} new row(s).` : 'Upload completed — no new rows (numbers may already exist in your contact book).');
      await loadAll().catch(() => {});
    } catch (e) { setError(e.response?.data?.error || 'Upload failed'); }
    finally { setUploadingContactsLoading(false); }
  }

  function buildComponentsForMeta() {
    const components = [];
    if (includeHeader) {
      if (headerFormat === 'TEXT') {
        if (!headerText.trim()) return { error: 'Header text is required for TEXT header', components: null };
        components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
      } else {
        if (!headerMediaUrl.trim()) return { error: 'Upload media for non-text header', components: null };
        if (!/\.[a-zA-Z0-9]{2,8}($|\?)/.test(headerMediaUrl.trim())) return { error: 'Header media URL must be a public file URL with extension', components: null };
        components.push({ type: 'HEADER', format: headerFormat, example: { header_handle: [headerMediaUrl.trim()] } });
      }
    }
    components.push({ type: 'BODY', text: templateContent.trim() });
    if (includeFooter && footerText.trim()) components.push({ type: 'FOOTER', text: footerText.trim() });
    if (buttons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map((b) => {
          if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
        }),
      });
    }
    return { error: null, components };
  }

  async function createTemplate() {
    if (!templateName.trim()) return;
    setError(''); setInfo(''); setTemplateValidationErrors([]); setCreatingTemplate(true);
    try {
      if (builderValidationErrors.length) { setTemplateValidationErrors(builderValidationErrors); return; }
      const { error: compError, components } = buildComponentsForMeta();
      if (compError) { setError(compError); return; }
      setTemplateValidationErrors([]);
      await api.post('/templates', { name: templateName, content: templateContent, category: templateCategory, language: templateLanguage, metaPayload: { components } });
      setTemplateName(''); setTemplateContent('');
      await loadAll(); setInfo('Template created');
      if (templateMode === 'create') navigate('/communications/templates');
    } catch (e) { setError(e.response?.data?.error || 'Could not create template'); }
    finally { setCreatingTemplate(false); }
  }

  async function saveEditTemplate(publishToMeta) {
    if (!editTemplateId) return;
    if (!templateName.trim()) { setError('Template name is required', 'TEMPLATES'); return; }
    setError(''); setInfo(''); setTemplateValidationErrors([]);
    if (publishToMeta && builderValidationErrors.length) { setTemplateValidationErrors(builderValidationErrors); return; }
    setSavingEditTemplate(true);
    try {
      const body = { name: templateName, content: templateContent, category: templateCategory, language: templateLanguage, publishToMeta: !!publishToMeta };
      if (publishToMeta) {
        const { error: compError, components } = buildComponentsForMeta();
        if (compError) { setError(compError, 'TEMPLATES'); return; }
        body.metaPayload = { components };
      }
      await api.patch(`/templates/${editTemplateId}`, body);
      await loadAll();
      setInfo(publishToMeta ? 'Template updated and submitted to Meta' : 'Template saved locally', 'TEMPLATES');
      navigate('/communications/templates');
    } catch (e) { setError(e.response?.data?.error || 'Could not save template', 'TEMPLATES'); }
    finally { setSavingEditTemplate(false); }
  }

  async function submitClone() {
    if (!cloneSource?.id || !cloneNewName.trim()) { setError('Enter a name for the clone', 'TEMPLATES'); return; }
    setCloneSubmitting(true); setError(''); setInfo('');
    try {
      await api.post(`/templates/${cloneSource.id}/clone`, { name: cloneNewName.trim(), createOnMeta: cloneOnMeta });
      setCloneSource(null); await reloadTemplatesFromApi(); setInfo('Template cloned', 'TEMPLATES');
    } catch (e) { setError(e.response?.data?.error || 'Could not clone template', 'TEMPLATES'); }
    finally { setCloneSubmitting(false); }
  }

  async function updateTemplateStatus(id) {
    setError(''); setInfo(''); setSyncingTemplateId(id);
    try {
      const { data } = await api.patch(`/templates/${id}/status`);
      await loadAll(); setInfo(`Template status synced from Meta: ${displayMetaStatus(data.metaStatus)}`);
    } catch (e) { setError(e.response?.data?.error || 'Could not update template status'); }
    finally { setSyncingTemplateId(''); }
  }

  async function sendTemplate() {
    setError(''); setInfo('');
    if (!selectedTemplateId) { setError('Select a template'); return; }
    if (bulkMode && !Object.values(selectedBulk).some(Boolean)) { setError('Select at least one contact for bulk send'); return; }
    if (!bulkMode && !selectedContactId) { setError('Select a contact'); return; }
    setSending(true);
    try {
      const contactIds = bulkMode ? contacts.filter((c) => selectedBulk[c.id]).map((c) => c.id) : [selectedContactId];
      const { data } = await api.post('/communications/send', { templateId: selectedTemplateId, contactIds });
      const fc = Number(data.failedCount) || 0;
      const sc = Number(data.sentCount) || 0;
      const failedRows = Array.isArray(data.results) ? data.results.filter((r) => r.status === 'failed') : [];
      const detail = failedRows[0]?.error || data.error || (Array.isArray(data.blocked) && data.blocked[0]?.reason) || null;
      if (sc === 0 && fc > 0) { setError(detail || 'No messages were delivered. Check template approval and phone numbers (+country code).'); setInfo(''); }
      else {
        setError('');
        setInfo(fc > 0
          ? `Sent: ${sc}, Failed: ${fc}${detail ? ` — ${detail}` : ''}. Wallet: ₹${Number(data.walletBalance).toLocaleString('en-IN')}`
          : `Delivered: ${sc}. Wallet balance: ₹${Number(data.walletBalance).toLocaleString('en-IN')}`);
      }
      await loadAll().catch(() => {});
    } catch (e) {
      const d = e.response?.data;
      const failedRow = Array.isArray(d?.results) ? d.results.find((r) => r.status === 'failed') : null;
      setError(failedRow?.error || d?.error || e.response?.data?.error || 'Send failed');
    } finally { setSending(false); }
  }

  async function changeTxnFilter(next) {
    if (txnLoading || next === txnFilter) return;
    setTxnFilter(next);
    await loadWalletTransactions({ filter: next, offset: 0, append: false });
  }

  async function toggleOnlyTopups(next) {
    setTxnOnlyTopups(next);
    await loadWalletTransactions({ filter: txnFilter, offset: 0, append: false, onlyTopups: next });
  }

  async function loadMoreTxns() {
    if (!txnHasMore || txnLoading) return;
    await loadWalletTransactions({ filter: txnFilter, offset: txnOffset, append: true });
  }

  async function uploadHeaderMedia(file) {
    if (!file) return;
    setError(''); setInfo(''); setHeaderMediaUploading(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/media/upload', { base64Data, mimeType: file.type || 'application/octet-stream', fileName: file.name });
      setHeaderMediaUrl(data.publicUrl || '');
      setInfo('Header media uploaded to Supabase');
    } catch (e) { setError(e.response?.data?.error || 'Header media upload failed'); }
    finally { setHeaderMediaUploading(false); }
  }

  // ── Tab nav config ────────────────────────────────────────────────────────
  const tabConfig = [
    { key: 'WALLET', label: 'Wallet', icon: WalletIcon },
    { key: 'SEND', label: 'Send', icon: SendIcon },
    { key: 'TEMPLATES', label: 'Templates', icon: FileText },
    { key: 'FIELDS', label: 'Fields', icon: Variable },
    { key: 'CONTACTS', label: 'Upload Contacts', icon: Users },
    { key: 'CONTACT_BOOK', label: 'Contact Book', icon: BookOpen },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader title={headerMeta.title} subtitle={headerMeta.subtitle} />

      {/* Feedback */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {info && (
        <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm px-4 py-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {info}
        </div>
      )}

      <div className={forcedTab ? 'space-y-5' : 'grid lg:grid-cols-[220px_1fr] gap-5 items-start'}>

        {/* ── Sidebar nav (only when not forcedTab) ──────────────────────── */}
        {!forcedTab && (
          <aside className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-3 py-2">
              Communications
            </div>
            <nav className="space-y-0.5">
              {tabConfig.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={[
                    'w-full text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-colors flex items-center gap-2.5',
                    activeTab === key
                      ? 'bg-brand-600 text-white'
                      : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  ].join(' ')}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <div className="space-y-5 min-w-0">

          {/* ── WALLET ─────────────────────────────────────────────────── */}
          {activeTab === 'WALLET' && (
            <>
              {/* Balance card */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">Wallet balance</div>
                    <div className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
                      ₹{Number(wallet?.balance || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      ₹{messageCost} per contact per message
                    </div>
                  </div>
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
                    <WalletIcon className="w-6 h-6 text-brand-600 dark:text-brand-400" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="Amount to add (₹)"
                    className={`${inputCls} w-52`}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={addingMoney}
                    onClick={addMoney}
                    disabled={!addAmount}
                  >
                    Add money
                  </Button>
                </div>
              </div>

              {/* Transactions */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Transactions</span>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={txnOnlyTopups}
                        onChange={(e) => toggleOnlyTopups(e.target.checked)}
                        className="accent-brand-600"
                      />
                      Only top-ups
                    </label>
                    <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                      {['ALL', 'CREDIT', 'DEBIT'].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => changeTxnFilter(f)}
                          className={[
                            'px-3 py-1.5 text-xs font-semibold transition-colors',
                            txnFilter === f
                              ? 'bg-brand-600 text-white'
                              : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800',
                          ].join(' ')}
                        >
                          {f === 'ALL' ? 'All' : f === 'CREDIT' ? 'Credit' : 'Debit'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800/60">
                      <tr>
                        {['Type', 'Amount', 'Description', 'When'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {walletTxns.map((t) => (
                        <tr key={t.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className={[
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                              t.type === 'CREDIT'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                            ].join(' ')}>
                              {t.type}
                            </span>
                          </td>
                          <td className={[
                            'px-4 py-3 font-semibold',
                            t.type === 'CREDIT' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
                          ].join(' ')}>
                            {t.type === 'CREDIT' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{t.description || '—'}</td>
                          <td className="px-4 py-3 text-neutral-500 text-xs">{new Date(t.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                      {!walletTxns.length && (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-500">
                            No wallet transactions yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                  <span className="text-xs text-neutral-500">
                    {txnLoading ? 'Loading…' : `${walletTxns.length} transaction(s)`}
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={loadMoreTxns}
                    disabled={!txnHasMore || txnLoading}
                    loading={txnLoading}
                  >
                    {txnHasMore ? 'Load more' : 'No more'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── SEND ───────────────────────────────────────────────────── */}
          {activeTab === 'SEND' && (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide">Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkMode}
                      onChange={(e) => setBulkMode(e.target.checked)}
                      className="accent-brand-600 w-4 h-4"
                    />
                    <span className="text-neutral-700 dark:text-neutral-300">Bulk send</span>
                  </label>
                </div>
              </div>

              {!bulkMode ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide">Contact</label>
                  <select
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select contact</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.phone} ({c.phone})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">Select contacts</label>
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-700 p-2 space-y-1">
                    {contacts.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={!!selectedBulk[c.id]}
                          onChange={(e) => setSelectedBulk((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                          className="accent-brand-600 w-4 h-4"
                        />
                        <span className="text-neutral-700 dark:text-neutral-300">{c.name || 'Unknown'} ({c.phone})</span>
                      </label>
                    ))}
                    {!contacts.length && <div className="text-sm text-neutral-500 px-2 py-2">No contacts available.</div>}
                  </div>
                </div>
              )}

              <div className="text-xs text-neutral-500 font-medium">
                Estimated charge: ₹{bulkMode
                  ? Object.values(selectedBulk).filter(Boolean).length * messageCost
                  : selectedContactId ? messageCost : 0}
              </div>

              {selectedTemplate && (
                <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 px-4 py-3 space-y-2">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Template source</div>
                  <div className="font-mono text-xs whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-300">
                    {selectedTemplate.content}
                  </div>
                  {!bulkMode && sendPreview ? (
                    <>
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 pt-1 uppercase tracking-wide">
                        Resolved preview
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200">
                        {sendPreview}
                      </div>
                    </>
                  ) : null}
                  {bulkMode && (
                    <p className="text-xs text-neutral-500">Open a single contact to see a resolved preview.</p>
                  )}
                </div>
              )}

              <Button
                variant="primary"
                loading={sending}
                onClick={sendTemplate}
                iconLeft={<SendIcon className="w-4 h-4" />}
              >
                {sending ? 'Sending…' : 'Send communication'}
              </Button>
            </div>
          )}

          {/* ── FIELDS ─────────────────────────────────────────────────── */}
          {activeTab === 'FIELDS' && (
            <div className="space-y-5">
              {/* Built-ins */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
                <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Built-in &amp; computed fields</div>
                <p className="text-xs text-neutral-500">
                  Business display values are edited per client under{' '}
                  <strong>Settings → Client profile</strong>. Use dotted names (e.g.{' '}
                  <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">customer.name</code>) or legacy
                  snake_case — both work.
                </p>
                <div className="space-y-4">
                  {BUILTIN_CATEGORY_ORDER.filter((c) => (builtinsByCategory[c] || []).length).map((cat) => (
                    <div key={cat}>
                      <div className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">{cat}</div>
                      <ul className="grid sm:grid-cols-2 gap-2">
                        {(builtinsByCategory[cat] || []).map((b) => (
                          <li key={b.key} className="rounded-xl border border-neutral-100 dark:border-neutral-800 px-3 py-2">
                            <div className="font-mono text-xs text-brand-700 dark:text-brand-300">{b.namespace || b.key}</div>
                            <div className="text-neutral-500 text-xs mt-0.5">{b.label}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom fields */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
                <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Custom fields</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <input value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)} placeholder="Key (e.g. offer_code)" className={inputCls} />
                  <input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Label shown in UI" className={inputCls} />
                  <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} className={inputCls}>
                    <option value="BUSINESS">Business — same value for every customer</option>
                    <option value="CUSTOMER">Customer — different per contact / customer</option>
                  </select>
                  <input value={newFieldDefault} onChange={(e) => setNewFieldDefault(e.target.value)} placeholder="Default value" className={inputCls} />
                </div>
                <Button variant="primary" size="sm" loading={fieldsSaving} onClick={createFieldDefinition} iconLeft={<Plus className="w-3.5 h-3.5" />}>
                  Create field
                </Button>
                <div className="overflow-x-auto rounded-xl border border-neutral-100 dark:border-neutral-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800/60">
                      <tr>
                        {['Key', 'Label', 'Type', 'Default', ''].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {fieldDefs.map((d) => (
                        <tr key={d.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-xs text-brand-700 dark:text-brand-300">{d.key}</td>
                          <td className="px-3 py-2.5 text-neutral-700 dark:text-neutral-300">{d.label}</td>
                          <td className="px-3 py-2.5 text-neutral-500">{d.type}</td>
                          <td className="px-3 py-2.5 max-w-xs truncate text-neutral-500">{d.defaultValue}</td>
                          <td className="px-3 py-2.5">
                            <button type="button" className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors" onClick={() => deleteFieldDefinition(d.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!fieldDefs.length && (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-neutral-500">No custom fields yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bulk CSV import */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-3">
                <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Bulk update customer fields (CSV)</div>
                <p className="text-xs text-neutral-500">
                  First row headers. Include a phone column (E.164). List CUSTOMER field keys as columns.
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                  <input value={fieldsPhoneCol} onChange={(e) => setFieldsPhoneCol(e.target.value)} placeholder="Phone column (default: phone)" className={inputCls} />
                  <input value={fieldsVarCols} onChange={(e) => setFieldsVarCols(e.target.value)} placeholder="Variable columns: loyalty_points, preferred_service" className={inputCls} />
                </div>
                <textarea
                  rows={6}
                  value={fieldsCsvPaste}
                  onChange={(e) => setFieldsCsvPaste(e.target.value)}
                  className={`${inputCls} font-mono resize-y`}
                  placeholder={'phone,loyalty_points\n+919876543210,120'}
                />
                <Button variant="secondary" size="sm" loading={fieldsSaving} onClick={importFieldCsv}>
                  {fieldsSaving ? 'Importing…' : 'Import CSV'}
                </Button>
              </div>
            </div>
          )}

          {/* ── CONTACTS ───────────────────────────────────────────────── */}
          {activeTab === 'CONTACTS' && (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Upload contacts</div>
              <p className="text-xs text-neutral-500">
                Paste CSV lines as: <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">name,phone</code>{' '}
                (one line per contact)
              </p>
              <textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className={`${inputCls} font-mono resize-y`}
                placeholder={'Ravi,+919876543210\nSana,+918123456789'}
              />
              <Button
                variant="primary"
                loading={uploadingContactsLoading}
                onClick={uploadContacts}
                iconLeft={<Users className="w-4 h-4" />}
              >
                {uploadingContactsLoading ? 'Uploading…' : 'Upload contacts'}
              </Button>
            </div>
          )}

          {/* ── CONTACT BOOK ───────────────────────────────────────────── */}
          {activeTab === 'CONTACT_BOOK' && (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Contact Book</span>
                <Button
                  variant="secondary"
                  size="xs"
                  loading={contactBookLoading}
                  onClick={loadContactBook}
                  iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60">
                    <tr>
                      {['Name', 'Phone', 'Paid', 'Bookings', 'Products', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {contactBookRows.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{r.name || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-neutral-500">{r.phone}</td>
                        <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">₹{Number(r.amountPaid || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100">{r.bookingCount || 0}</div>
                          {Array.isArray(r.bookingIds) && r.bookingIds.length ? (
                            <div className="text-[11px] text-neutral-400 truncate max-w-[200px]">
                              {r.bookingIds.slice(0, 5).join(', ')}{r.bookingIds.length > 5 ? ` +${r.bookingIds.length - 5} more` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {Array.isArray(r.productsBought) && r.productsBought.length ? (
                            <div>
                              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{r.productsBought.length} item(s)</div>
                              <div className="text-[11px] text-neutral-400 truncate max-w-[200px]">
                                {r.productsBought.slice(0, 4).map((p) => `${p.name}${p.count > 1 ? ` (${p.count})` : ''}`).join(', ')}
                                {r.productsBought.length > 4 ? ` +${r.productsBought.length - 4} more` : ''}
                              </div>
                            </div>
                          ) : <span className="text-xs text-neutral-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => deleteContact(r.id)} className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!contactBookRows.length && !contactBookLoading && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">No contacts found.</td></tr>
                    )}
                    {contactBookLoading && !contactBookRows.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center">
                          <Loader2 className="w-5 h-5 text-neutral-400 animate-spin mx-auto" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TEMPLATES ──────────────────────────────────────────────── */}
          {activeTab === 'TEMPLATES' && (
            <>
              {/* Template builder */}
              {(templateMode === 'combined' || templateMode === 'create' || templateMode === 'edit') && (
                <div className="relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
                  {editingTemplateLoading && templateMode === 'edit' && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-neutral-900/80">
                      <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                    </div>
                  )}
                  <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {templateMode === 'edit' ? 'Edit template' : 'Create template'}
                  </div>

                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    className={inputCls}
                  />

                  {/* Variable picker */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-neutral-500">Insert variable:</span>
                    <select
                      aria-label="Insert template variable"
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) insertTemplateToken(v);
                        e.target.value = '';
                      }}
                    >
                      <option value="">Choose…</option>
                      {BUILTIN_CATEGORY_ORDER.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {(builtinsByCategory[cat] || []).map((b) => (
                            <option key={b.key} value={b.key}>
                              {b.namespace ? `${b.namespace} → ${b.key}` : b.key} — {b.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {fieldDefs.length ? (
                        <optgroup label="Custom fields">
                          {fieldDefs.map((d) => <option key={d.id} value={d.key}>{d.key}</option>)}
                        </optgroup>
                      ) : null}
                    </select>
                  </div>

                  <div>
                    <textarea
                      ref={templateBodyRef}
                      rows={6}
                      value={templateContent}
                      onChange={(e) => setTemplateContent(e.target.value)}
                      placeholder="Hi {{customer_name}}, this is a reminder from {{business_name}}."
                      className={`${inputCls} font-mono resize-y`}
                    />
                    <div className="text-[11px] text-neutral-400 mt-1 text-right">
                      {templateContent.trim().length}/{META_LIMITS.BODY_MAX}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Category</label>
                      <select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)} className={inputCls}>
                        {(metaTemplateOptions.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Language</label>
                      <select value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)} className={inputCls}>
                        {(metaTemplateOptions.languages || []).map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Header section */}
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer text-neutral-700 dark:text-neutral-300">
                      <input type="checkbox" checked={includeHeader} onChange={(e) => setIncludeHeader(e.target.checked)} className="accent-brand-600 w-4 h-4" />
                      Include Header
                    </label>
                    {includeHeader && (
                      <div className="grid md:grid-cols-2 gap-3">
                        <select value={headerFormat} onChange={(e) => setHeaderFormat(e.target.value)} className={inputCls}>
                          {['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                        {headerFormat === 'TEXT' && (
                          <div>
                            <input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Header text" className={inputCls} />
                            <div className="text-[11px] text-neutral-400 mt-1">{headerText.trim().length}/{META_LIMITS.HEADER_TEXT_MAX}</div>
                          </div>
                        )}
                        {headerFormat !== 'TEXT' && (
                          <div className="space-y-2">
                            <input type="file" onChange={(e) => uploadHeaderMedia(e.target.files?.[0])} className="text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:rounded-lg file:border file:border-neutral-200 dark:file:border-neutral-700 file:bg-white dark:file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
                            {headerMediaUploading && <div className="text-[11px] text-neutral-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</div>}
                            {!!headerMediaUrl && <div className="text-[11px] text-emerald-700 dark:text-emerald-400 break-all">Uploaded: {headerMediaUrl}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer section */}
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer text-neutral-700 dark:text-neutral-300">
                      <input type="checkbox" checked={includeFooter} onChange={(e) => setIncludeFooter(e.target.checked)} className="accent-brand-600 w-4 h-4" />
                      Include Footer
                    </label>
                    {includeFooter && (
                      <div>
                        <input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Footer text" className={inputCls} />
                        <div className="text-[11px] text-neutral-400 mt-1">{footerText.trim().length}/{META_LIMITS.FOOTER_TEXT_MAX}</div>
                      </div>
                    )}
                  </div>

                  {/* Buttons section */}
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Buttons</span>
                      <button
                        type="button"
                        onClick={() => setButtons((prev) => [...prev, { id: crypto.randomUUID(), type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }])}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add button
                      </button>
                    </div>
                    {buttons.map((b) => (
                      <div key={b.id} className="grid md:grid-cols-4 gap-2 items-start">
                        <select
                          value={b.type}
                          onChange={(e) => setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, type: e.target.value } : x)))}
                          className={inputCls}
                        >
                          <option value="QUICK_REPLY">QUICK_REPLY</option>
                          <option value="URL">URL</option>
                          <option value="PHONE_NUMBER">PHONE_NUMBER</option>
                        </select>
                        <input
                          value={b.text}
                          onChange={(e) => setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))}
                          placeholder="Button text"
                          className={inputCls}
                        />
                        {b.type === 'URL' && (
                          <input
                            value={b.url}
                            onChange={(e) => setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, url: e.target.value } : x)))}
                            placeholder="https://example.com"
                            className={inputCls}
                          />
                        )}
                        {b.type === 'PHONE_NUMBER' && (
                          <input
                            value={b.phoneNumber}
                            onChange={(e) => setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, phoneNumber: e.target.value } : x)))}
                            placeholder="+919999999999"
                            className={inputCls}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setButtons((prev) => prev.filter((x) => x.id !== b.id))}
                          className="text-xs text-red-600 font-semibold hover:text-red-700 transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                    ))}
                    <div className="text-[11px] text-neutral-400">
                      Buttons: {buttons.length}/{META_LIMITS.TOTAL_BUTTONS_MAX} · URL: {buttons.filter((b) => b.type === 'URL').length}/{META_LIMITS.URL_BUTTONS_MAX} · Phone: {buttons.filter((b) => b.type === 'PHONE_NUMBER').length}/{META_LIMITS.PHONE_BUTTONS_MAX}
                    </div>
                  </div>

                  {/* Validation errors */}
                  {templateValidationErrors.length > 0 && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 space-y-1">
                      {templateValidationErrors.map((msg) => (
                        <div key={msg} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          {msg}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  {templateMode === 'edit' ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button variant="secondary" size="sm" loading={savingEditTemplate} disabled={editingTemplateLoading} onClick={() => saveEditTemplate(false)}>
                        Save draft (local)
                      </Button>
                      <Button variant="primary" size="sm" loading={savingEditTemplate} disabled={editingTemplateLoading} onClick={() => saveEditTemplate(true)}>
                        Save &amp; publish to Meta
                      </Button>
                      <Button variant="ghost" size="sm" disabled={savingEditTemplate} onClick={() => navigate('/communications/templates')}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button variant="primary" size="sm" loading={creatingTemplate} onClick={createTemplate}>
                        {creatingTemplate ? 'Creating…' : 'Create template'}
                      </Button>
                      {templateMode === 'create' && (
                        <Button variant="ghost" size="sm" onClick={() => navigate('/communications/templates')}>
                          Back to templates
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Templates list */}
              {(templateMode === 'combined' || templateMode === 'list') && (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Templates</span>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => navigate('/communications/templates/create')}
                      iconLeft={<Plus className="w-3.5 h-3.5" />}
                    >
                      Create
                    </Button>
                  </div>
                  <div className="px-5 py-2.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
                    <p className="text-xs text-neutral-500">
                      Use friendly keys in the body (e.g.{' '}
                      <code className="font-mono bg-white dark:bg-neutral-900 px-1 rounded border border-neutral-200 dark:border-neutral-700">{`{{customer_name}}`}</code>). Use &ldquo;Map{' '}
                      <code className="font-mono">{`{{n}}`}</code>&rdquo; to wire numbered Meta placeholders.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-neutral-50 dark:bg-neutral-800/60">
                        <tr>
                          {['Name', 'Content', 'Meta status', 'Local status', 'Actions'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {templates.map((t) => (
                          <tr key={t.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{t.name}</td>
                            <td className="px-4 py-3 text-neutral-500 max-w-xs truncate text-xs">{t.content}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${metaStatusBadgeClass(t.metaStatus || 'NOT_FOUND')}`}>
                                {displayMetaStatus(t.metaStatus)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-neutral-500">{t.status}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <button type="button" className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 transition-colors" onClick={() => navigate(`/communications/templates/${t.id}/edit`)}>
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                                <button type="button" className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-100 inline-flex items-center gap-1 transition-colors" onClick={() => { setCloneSource({ id: t.id, name: t.name }); setCloneNewName(`Copy of ${t.name}`); setCloneOnMeta(false); }}>
                                  <Copy className="w-3 h-3" /> Clone
                                </button>
                                <button type="button" disabled={syncingTemplateId === t.id} className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 disabled:opacity-50 transition-colors" onClick={() => updateTemplateStatus(t.id)}>
                                  <RefreshCw className={`w-3 h-3 ${syncingTemplateId === t.id ? 'animate-spin' : ''}`} />
                                  Sync
                                </button>
                                <button type="button" className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-100 inline-flex items-center gap-1 transition-colors" onClick={() => openMappingModal(t.id)}>
                                  Map {`{{n}}`}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!templates.length && (
                          <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">No templates yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Clone modal ─────────────────────────────────────────────────── */}
      <Modal
        open={!!cloneSource}
        onClose={() => setCloneSource(null)}
        title="Clone template"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCloneSource(null)} disabled={cloneSubmitting}>Cancel</Button>
            <Button variant="primary" size="sm" loading={cloneSubmitting} onClick={submitClone}>Clone</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            From: <span className="font-semibold text-neutral-800 dark:text-neutral-200">{cloneSource?.name}</span>
          </p>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">New template name</label>
            <input value={cloneNewName} onChange={(e) => setCloneNewName(e.target.value)} className={inputCls} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-neutral-700 dark:text-neutral-300">
            <input type="checkbox" checked={cloneOnMeta} onChange={(e) => setCloneOnMeta(e.target.checked)} className="accent-brand-600 w-4 h-4" />
            Also create on Meta (WhatsApp)
          </label>
        </div>
      </Modal>

      {/* ── Variable mapping modal ──────────────────────────────────────── */}
      <Modal
        open={!!mappingModalId}
        onClose={() => setMappingModalId('')}
        title="Map numbered placeholders"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMappingModalId('')}>Cancel</Button>
            <Button variant="primary" size="sm" loading={mappingLoading} disabled={!mappingRows.length} onClick={saveTemplateMappings}>
              Save mapping
            </Button>
          </div>
        }
      >
        {mappingLoading && !mappingRows.length ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
          </div>
        ) : !mappingRows.length ? (
          <p className="text-sm text-neutral-500">
            This template has no <code className="font-mono">{`{{1}}`}</code>-style placeholders. Use named keys in
            the template body instead.
          </p>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {mappingRows.map((row, idx) => (
              <div key={row.placeholderIndex} className="grid grid-cols-[80px_1fr] gap-3 items-center">
                <span className="text-xs font-mono text-neutral-500 bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1">
                  {`{{${row.placeholderIndex}}}`}
                </span>
                <select
                  value={row.variableKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMappingRows((prev) => prev.map((r, i) => (i === idx ? { ...r, variableKey: v } : r)));
                  }}
                  className={inputCls}
                >
                  <option value="">— Select field —</option>
                  {selectableVariableKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
