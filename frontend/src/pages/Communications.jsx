import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function metaStatusBadgeClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'APPROVED') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (normalized === 'PENDING' || normalized === 'IN_REVIEW') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }
  if (normalized === 'REJECTED') {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function displayMetaStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (!normalized) return 'NOT_FOUND';
  // Meta API often reports "PENDING" while UI labels this state as "In review".
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

export default function Communications({ forcedTab = null, templateMode = 'combined' }) {
  const TXN_PAGE_SIZE = 20;
  const tabs = ['WALLET', 'SEND', 'TEMPLATES', 'CONTACTS', 'CONTACT_BOOK'];
  const tabMeta = {
    WALLET: {
      title: 'Wallet',
      subtitle: 'Check balance, add money, and review wallet transactions.',
    },
    SEND: {
      title: 'Send Communication',
      subtitle: 'Send approved templates to one contact or in bulk.',
    },
    TEMPLATES: {
      title: 'Templates',
      subtitle: 'Create templates, review status, and sync updates from Meta.',
    },
    CONTACTS: {
      title: 'Upload Contacts',
      subtitle: 'Upload contact CSV data for campaign and bulk communication.',
    },
    CONTACT_BOOK: {
      title: 'Contact Book',
      subtitle: 'View uploaded contacts with payments and booking history.',
    },
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
    tabs.reduce((acc, tab) => {
      acc[tab] = { error: '', info: '' };
      return acc;
    }, {}),
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
  const [activeTab, setActiveTab] = useState(forcedTab || 'WALLET');
  const navigate = useNavigate();

  useEffect(() => {
    if (forcedTab && tabs.includes(forcedTab)) {
      setActiveTab(forcedTab);
    }
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

  const builderValidationErrors = useMemo(() => {
    const errs = [];
    const body = templateContent.trim();
    if (!templateName.trim()) errs.push('Template name is required');
    if (!body) errs.push('Body text is required');
    if (body.length > META_LIMITS.BODY_MAX) {
      errs.push(`Body text must be ${META_LIMITS.BODY_MAX} characters or less`);
    }

    if (includeHeader && headerFormat === 'TEXT') {
      const h = headerText.trim();
      if (!h) errs.push('Header text is required for TEXT header');
      if (h.length > META_LIMITS.HEADER_TEXT_MAX) {
        errs.push(`Header text must be ${META_LIMITS.HEADER_TEXT_MAX} characters or less`);
      }
    }

    if (includeFooter && footerText.trim().length > META_LIMITS.FOOTER_TEXT_MAX) {
      errs.push(`Footer text must be ${META_LIMITS.FOOTER_TEXT_MAX} characters or less`);
    }

    if (buttons.length > META_LIMITS.TOTAL_BUTTONS_MAX) {
      errs.push(`Total buttons cannot exceed ${META_LIMITS.TOTAL_BUTTONS_MAX}`);
    }

    const urlCount = buttons.filter((b) => b.type === 'URL').length;
    const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
    if (urlCount > META_LIMITS.URL_BUTTONS_MAX) {
      errs.push(`URL buttons cannot exceed ${META_LIMITS.URL_BUTTONS_MAX}`);
    }
    if (phoneCount > META_LIMITS.PHONE_BUTTONS_MAX) {
      errs.push(`Phone number buttons cannot exceed ${META_LIMITS.PHONE_BUTTONS_MAX}`);
    }

    buttons.forEach((b, idx) => {
      const label = `Button ${idx + 1}`;
      const text = (b.text || '').trim();
      if (!text) errs.push(`${label}: text is required`);
      if (text.length > META_LIMITS.BUTTON_TEXT_MAX) {
        errs.push(`${label}: text must be ${META_LIMITS.BUTTON_TEXT_MAX} characters or less`);
      }
      if (b.type === 'URL') {
        const url = (b.url || '').trim();
        if (!url) {
          errs.push(`${label}: URL is required`);
        } else if (!/^https?:\/\/\S+$/i.test(url)) {
          errs.push(`${label}: URL must start with http:// or https://`);
        }
      }
      if (b.type === 'PHONE_NUMBER') {
        const pn = (b.phoneNumber || '').trim();
        if (!pn) {
          errs.push(`${label}: phone number is required`);
        } else if (!/^\+?[1-9]\d{7,14}$/.test(pn.replace(/\s+/g, ''))) {
          errs.push(`${label}: phone number must be valid E.164 format`);
        }
      }
    });

    return errs;
  }, [
    templateName,
    templateContent,
    includeHeader,
    headerFormat,
    headerText,
    includeFooter,
    footerText,
    buttons,
  ]);

  async function loadWalletTransactions({
    filter = txnFilter,
    offset = 0,
    append = false,
    onlyTopups = txnOnlyTopups,
  } = {}) {
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

  async function ensureWalletLoaded() {
    await refreshWallet();
  }

  async function reloadContactsFromApi() {
    try {
      const { data } = await api.get('/contacts');
      const list = asArray(data);
      setContacts(list);
      setSelectedContactId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch {
      /* keep existing list */
    }
  }

  async function reloadTemplatesFromApi() {
    try {
      const { data } = await api.get('/templates');
      const templatesData = asArray(data?.templates || data);
      setTemplates(templatesData);
      if (data?.metaSyncError) {
        setError(`Meta sync issue: ${data.metaSyncError}`, 'TEMPLATES');
      }
      setSelectedTemplateId((prev) => {
        if (prev && templatesData.some((t) => t.id === prev)) return prev;
        return templatesData[0]?.id || '';
      });
    } catch {
      /* keep existing templates */
    }
  }

  /** Refetch wallet, contacts, templates, contact book, and (when relevant) wallet transactions. */
  async function loadAll() {
    await refreshWallet();
    await reloadContactsFromApi();
    await reloadTemplatesFromApi();
    try {
      await loadContactBook();
    } catch {
      // Contact book is optional for send/upload flows.
    }
    await loadWalletTransactions({
      filter: txnFilter,
      offset: 0,
      append: false,
      onlyTopups: txnOnlyTopups,
    }).catch(() => {});
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
    if (data?.metaSyncError) {
      setError(`Meta sync issue: ${data.metaSyncError}`, 'TEMPLATES');
    }
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
    } finally {
      setContactBookLoading(false);
    }
  }

  async function deleteContact(id) {
    if (!id) return;
    const ok = window.confirm('Delete this contact?');
    if (!ok) return;
    setError('', 'CONTACT_BOOK');
    setInfo('', 'CONTACT_BOOK');
    try {
      await api.delete(`/contacts/${id}`);
      setInfo('Contact deleted', 'CONTACT_BOOK');
      setContactBookRows((prev) => prev.filter((r) => r.id !== id));
      await loadContactBook();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete contact', 'CONTACT_BOOK');
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load only what each tab needs (avoid cross-tab API spam).
        if (activeTab === 'WALLET') {
          await ensureWalletLoaded();
          if (!cancelled) {
            await loadWalletTransactions({
              filter: txnFilter,
              offset: 0,
              append: false,
              onlyTopups: txnOnlyTopups,
            });
          }
        } else if (activeTab === 'SEND') {
          await Promise.all([ensureWalletLoaded(), ensureContactsLoaded(), ensureTemplatesLoaded()]);
        } else if (activeTab === 'TEMPLATES') {
          await Promise.all([ensureTemplatesLoaded(), ensureMetaTemplateOptionsLoaded()]);
        } else if (activeTab === 'CONTACT_BOOK') {
          await loadContactBook();
        } else if (activeTab === 'CONTACTS') {
          // Upload page doesn't need list calls on every visit.
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load communication data', activeTab);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, txnFilter, txnOnlyTopups]);

  const AUTO_REFRESH_MS = 10000;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      (async () => {
        try {
          if (activeTab === 'WALLET') {
            await refreshWallet();
            await loadWalletTransactions({
              filter: txnFilter,
              offset: 0,
              append: false,
              onlyTopups: txnOnlyTopups,
            });
          } else if (activeTab === 'SEND') {
            await refreshWallet();
            await reloadContactsFromApi();
            await reloadTemplatesFromApi();
          } else if (activeTab === 'TEMPLATES') {
            await reloadTemplatesFromApi();
          } else if (activeTab === 'CONTACT_BOOK') {
            await loadContactBook();
          }
        } catch {
          /* ignore */
        }
      })();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, txnFilter, txnOnlyTopups]);

  async function addMoney() {
    if (!addAmount) return;
    setError('');
    setInfo('');
    setAddingMoney(true);
    try {
      const scriptLoaded = await new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
      });
      if (!scriptLoaded) {
        setError('Could not load Razorpay checkout');
        return;
      }
      const { data } = await api.post('/wallet/add-money', { amount: Number(addAmount) });
      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: Math.round(Number(data.amount) * 100),
        currency: data.currency || 'INR',
        name: 'WAPilot',
        description: 'Wallet top-up',
        order_id: data.orderId,
        handler: async (resp) => {
          await api.patch(`/wallet/add-money/${data.paymentId}/verify`, {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          setAddAmount('');
          await loadAll();
          setInfo('Wallet updated');
        },
      });
      rzp.on('payment.failed', () => setError('Payment failed or cancelled'));
      rzp.open();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not add money');
    } finally {
      setAddingMoney(false);
    }
  }

  async function uploadContacts() {
    if (!csvText.trim()) return;
    setError('');
    setInfo('');
    setUploadingContactsLoading(true);
    try {
      const { data } = await api.post('/contacts/upload', { csvText });
      setCsvText('');
      setError('');
      const n = Number(data?.inserted ?? 0);
      setInfo(
        n > 0
          ? `Uploaded contacts: ${n} new row(s).`
          : 'Upload completed — no new rows (numbers may already exist in your contact book).',
      );
      await loadAll().catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingContactsLoading(false);
    }
  }

  async function createTemplate() {
    if (!templateName.trim()) return;
    setError('');
    setInfo('');
    setTemplateValidationErrors([]);
    setCreatingTemplate(true);
    try {
      if (builderValidationErrors.length) {
        setTemplateValidationErrors(builderValidationErrors);
        return;
      }
      const components = [];
      if (includeHeader) {
        if (headerFormat === 'TEXT') {
          if (!headerText.trim()) {
            setError('Header text is required for TEXT header');
            return;
          }
          components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
        } else {
          if (!headerMediaUrl.trim()) {
            setError('Upload media for non-text header');
            return;
          }
          if (!/\.[a-zA-Z0-9]{2,8}($|\?)/.test(headerMediaUrl.trim())) {
            setError('Header media URL must be a public file URL with extension');
            return;
          }
          components.push({
            type: 'HEADER',
            format: headerFormat,
            example: {
              header_handle: [headerMediaUrl.trim()],
            },
          });
        }
      }
      components.push({ type: 'BODY', text: templateContent.trim() });
      if (includeFooter && footerText.trim()) {
        components.push({ type: 'FOOTER', text: footerText.trim() });
      }
      if (buttons.length) {
        components.push({
          type: 'BUTTONS',
          buttons: buttons.map((b) => {
            if (b.type === 'QUICK_REPLY') {
              return { type: 'QUICK_REPLY', text: b.text };
            }
            if (b.type === 'URL') {
              return { type: 'URL', text: b.text, url: b.url };
            }
            return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
          }),
        });
      }
      const parsedMetaPayload = { components };
      setTemplateValidationErrors([]);

      await api.post('/templates', {
        name: templateName,
        content: templateContent,
        category: templateCategory,
        language: templateLanguage,
        metaPayload: parsedMetaPayload,
      });
      setTemplateName('');
      setTemplateContent('');
      await loadAll();
      setInfo('Template created');
      if (templateMode === 'create') {
        navigate('/communications/templates');
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create template');
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function updateTemplateStatus(id) {
    setError('');
    setInfo('');
    setSyncingTemplateId(id);
    try {
      const { data } = await api.patch(`/templates/${id}/status`);
      await loadAll();
      setInfo(`Template status synced from Meta: ${displayMetaStatus(data.metaStatus)}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not update template status');
    } finally {
      setSyncingTemplateId('');
    }
  }

  async function sendTemplate() {
    setError('');
    setInfo('');
    if (!selectedTemplateId) {
      setError('Select a template');
      return;
    }
    if (bulkMode && !Object.values(selectedBulk).some(Boolean)) {
      setError('Select at least one contact for bulk send');
      return;
    }
    if (!bulkMode && !selectedContactId) {
      setError('Select a contact');
      return;
    }
    setSending(true);
    try {
      const contactIds = bulkMode
        ? contacts.filter((c) => selectedBulk[c.id]).map((c) => c.id)
        : [selectedContactId];
      const { data } = await api.post('/communications/send', {
        templateId: selectedTemplateId,
        contactIds,
      });
      setError('');
      const fc = Number(data.failedCount) || 0;
      const sc = Number(data.sentCount) || 0;
      setInfo(
        fc > 0
          ? `Sent: ${sc}, Failed: ${fc}, Wallet balance: ₹${Number(data.walletBalance).toLocaleString('en-IN')}`
          : `Delivered: ${sc}. Wallet balance: ₹${Number(data.walletBalance).toLocaleString('en-IN')}`,
      );
      await loadAll().catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || 'Send failed');
    } finally {
      setSending(false);
    }
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
    setError('');
    setInfo('');
    setHeaderMediaUploading(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/media/upload', {
        base64Data,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
      });
      setHeaderMediaUrl(data.publicUrl || '');
      setInfo('Header media uploaded to Supabase');
    } catch (e) {
      setError(e.response?.data?.error || 'Header media upload failed');
    } finally {
      setHeaderMediaUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{headerMeta.title}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{headerMeta.subtitle}</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      {info && <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">{info}</div>}

      <div className={forcedTab ? 'space-y-4' : 'grid lg:grid-cols-[260px_1fr] gap-4 items-start'}>
        {!forcedTab && (
          <aside className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-2 py-2">Communications</div>
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    'w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    activeTab === tab
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70',
                  ].join(' ')}
                >
                  {tab === 'WALLET'
                    ? 'Wallet'
                    : tab === 'SEND'
                      ? 'Send Communication'
                      : tab === 'TEMPLATES'
                        ? 'Template Creation & Listing'
                        : 'Upload Contacts'}
                </button>
              ))}
            </nav>
          </aside>
        )}

        <div className="space-y-4">
          {activeTab === 'WALLET' && (
            <>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
            <div className="font-semibold">Wallet</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Balance: <span className="font-semibold">₹{Number(wallet?.balance || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="text-xs text-slate-500">Charge: ₹{messageCost} per contact per message</div>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="Add money amount"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm w-48"
              />
              <button
                type="button"
                onClick={addMoney}
                disabled={addingMoney}
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
              >
                {addingMoney ? 'Starting...' : 'Add money'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="font-semibold text-sm">Wallet transactions</div>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {['ALL', 'CREDIT', 'DEBIT'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => changeTxnFilter(f)}
                    className={[
                      'px-3 py-1.5 text-xs font-semibold',
                      txnFilter === f
                        ? 'bg-brand-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300',
                    ].join(' ')}
                  >
                    {f === 'ALL' ? 'All' : f === 'CREDIT' ? 'Credit' : 'Debit'}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={txnOnlyTopups}
                  onChange={(e) => toggleOnlyTopups(e.target.checked)}
                />
                Only Top-ups
              </label>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {walletTxns.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                          t.type === 'CREDIT'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                        ].join(' ')}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td
                      className={[
                        'px-4 py-3 font-semibold',
                        t.type === 'CREDIT'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300',
                      ].join(' ')}
                    >
                      {t.type === 'CREDIT' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t.description || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {!walletTxns.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No wallet transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="text-xs text-slate-500">
                {txnLoading ? 'Loading transactions...' : `Showing ${walletTxns.length} transaction(s)`}
              </div>
              <button
                type="button"
                onClick={loadMoreTxns}
                disabled={!txnHasMore || txnLoading}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {txnLoading ? 'Loading...' : txnHasMore ? 'Load more' : 'No more'}
              </button>
            </div>
          </div>
            </>
          )}

          {activeTab === 'CONTACTS' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="font-semibold">Upload contacts</div>
              <p className="text-xs text-slate-500">Paste CSV lines as: name,phone (one line per contact)</p>
              <textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                placeholder={'Ravi,+919876543210\nSana,+918123456789'}
              />
              <button
                type="button"
                onClick={uploadContacts}
                disabled={uploadingContactsLoading}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold"
              >
                {uploadingContactsLoading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          )}

          {activeTab === 'CONTACT_BOOK' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm flex items-center justify-between gap-3">
                <span>Contact Book</span>
                <button
                  type="button"
                  onClick={loadContactBook}
                  disabled={contactBookLoading}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {contactBookLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Amount paid</th>
                    <th className="px-4 py-3">Booking No</th>
                    <th className="px-4 py-3">Products bought</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {contactBookRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">{r.name || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.phone}</td>
                      <td className="px-4 py-3">₹{Number(r.amountPaid || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.bookingCount || 0}</div>
                        {Array.isArray(r.bookingIds) && r.bookingIds.length ? (
                          <div className="text-[11px] text-slate-500 truncate max-w-[320px]">
                            {r.bookingIds.slice(0, 5).join(', ')}
                            {r.bookingIds.length > 5 ? ` +${r.bookingIds.length - 5} more` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {Array.isArray(r.productsBought) && r.productsBought.length ? (
                          <div className="space-y-1 max-w-[360px]">
                            <div className="text-xs font-semibold">{r.productsBought.length} item(s)</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {r.productsBought
                                .slice(0, 4)
                                .map((p) => `${p.name}${p.count > 1 ? ` (${p.count})` : ''}`)
                                .join(', ')}
                              {r.productsBought.length > 4 ? ` +${r.productsBought.length - 4} more` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => deleteContact(r.id)}
                          className="text-xs font-semibold text-rose-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!contactBookRows.length && !contactBookLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No contacts found.
                      </td>
                    </tr>
                  )}
                  {contactBookLoading && !contactBookRows.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Loading contact book...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'TEMPLATES' && (
            <>
          {(templateMode === 'combined' || templateMode === 'create') && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
            <div className="font-semibold">Create template</div>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <textarea
              rows={6}
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              placeholder="Hi {{name}}, this is a reminder from our team."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <div className="text-[11px] text-slate-500">
              Body length: {templateContent.trim().length}/{META_LIMITS.BODY_MAX}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Category</label>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {(metaTemplateOptions.categories || []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Language</label>
                <select
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {(metaTemplateOptions.languages || []).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={includeHeader}
                        onChange={(e) => setIncludeHeader(e.target.checked)}
                      />
                      Include Header
                    </label>
                    {includeHeader && (
                      <div className="grid md:grid-cols-2 gap-2">
                        <select
                          value={headerFormat}
                          onChange={(e) => setHeaderFormat(e.target.value)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                        >
                          {['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        {headerFormat === 'TEXT' && (
                          <div className="space-y-1">
                            <input
                              value={headerText}
                              onChange={(e) => setHeaderText(e.target.value)}
                              placeholder="Header text"
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                            />
                            <div className="text-[11px] text-slate-500">
                              Header length: {headerText.trim().length}/{META_LIMITS.HEADER_TEXT_MAX}
                            </div>
                          </div>
                        )}
                        {headerFormat !== 'TEXT' && (
                          <div className="space-y-2">
                            <input
                              type="file"
                              onChange={(e) => uploadHeaderMedia(e.target.files?.[0])}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                            />
                            {headerMediaUploading && <div className="text-[11px] text-slate-500">Uploading media...</div>}
                            {!!headerMediaUrl && (
                              <div className="text-[11px] text-emerald-700 break-all">
                                Uploaded URL: {headerMediaUrl}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={includeFooter}
                        onChange={(e) => setIncludeFooter(e.target.checked)}
                      />
                      Include Footer
                    </label>
                    {includeFooter && (
                      <div className="space-y-1">
                        <input
                          value={footerText}
                          onChange={(e) => setFooterText(e.target.value)}
                          placeholder="Footer text"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                        />
                        <div className="text-[11px] text-slate-500">
                          Footer length: {footerText.trim().length}/{META_LIMITS.FOOTER_TEXT_MAX}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">Buttons</div>
                      <button
                        type="button"
                        onClick={() =>
                          setButtons((prev) => [...prev, { id: crypto.randomUUID(), type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }])
                        }
                        className="text-xs font-semibold text-brand-700"
                      >
                        + Add button
                      </button>
                    </div>
                    {buttons.map((b) => (
                      <div key={b.id} className="grid md:grid-cols-4 gap-2">
                        <select
                          value={b.type}
                          onChange={(e) =>
                            setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, type: e.target.value } : x)))
                          }
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                        >
                          <option value="QUICK_REPLY">QUICK_REPLY</option>
                          <option value="URL">URL</option>
                          <option value="PHONE_NUMBER">PHONE_NUMBER</option>
                        </select>
                        <input
                          value={b.text}
                          onChange={(e) =>
                            setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))
                          }
                          placeholder="Button text"
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                        />
                        {b.type === 'URL' && (
                          <input
                            value={b.url}
                            onChange={(e) =>
                              setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, url: e.target.value } : x)))
                            }
                            placeholder="https://example.com"
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                          />
                        )}
                        {b.type === 'PHONE_NUMBER' && (
                          <input
                            value={b.phoneNumber}
                            onChange={(e) =>
                              setButtons((prev) => prev.map((x) => (x.id === b.id ? { ...x, phoneNumber: e.target.value } : x)))
                            }
                            placeholder="+919999999999"
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setButtons((prev) => prev.filter((x) => x.id !== b.id))}
                          className="text-xs text-rose-700 font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-500">
                      Buttons: {buttons.length}/{META_LIMITS.TOTAL_BUTTONS_MAX} | URL: {buttons.filter((b) => b.type === 'URL').length}/{META_LIMITS.URL_BUTTONS_MAX} | Phone: {buttons.filter((b) => b.type === 'PHONE_NUMBER').length}/{META_LIMITS.PHONE_BUTTONS_MAX}
                    </div>
                  </div>
              </div>
            </div>
            {!!templateValidationErrors.length && (
              <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2 space-y-1">
                {templateValidationErrors.map((msg) => (
                  <div key={msg}>- {msg}</div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={createTemplate}
              disabled={creatingTemplate}
              className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
            >
              {creatingTemplate ? 'Creating...' : 'Create template'}
            </button>
            {templateMode === 'create' && (
              <button
                type="button"
                onClick={() => navigate('/communications/templates')}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold ml-2"
              >
                Back to templates
              </button>
            )}
          </div>
          )}

          {(templateMode === 'combined' || templateMode === 'list') && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm flex items-center justify-between gap-3">
              <span>Templates</span>
              <button
                type="button"
                onClick={() => navigate('/communications/templates/create')}
                className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-xs font-semibold"
              >
                Create Template
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Content</th>
                  <th className="px-4 py-3">Meta Status</th>
                  <th className="px-4 py-3">Local Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-md truncate">{t.content}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                          metaStatusBadgeClass(t.metaStatus || 'NOT_FOUND'),
                        ].join(' ')}
                      >
                        {displayMetaStatus(t.metaStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{t.status}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={syncingTemplateId === t.id}
                        className="text-xs font-semibold text-brand-700"
                        onClick={() => updateTemplateStatus(t.id)}
                      >
                        {syncingTemplateId === t.id ? 'Syncing...' : 'Sync from Meta'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!templates.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No templates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
            </>
          )}

          {activeTab === 'SEND' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="font-semibold">Send communication</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="">Select template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={bulkMode} onChange={(e) => setBulkMode(e.target.checked)} />
                    Bulk send
                  </label>
                </div>
              </div>

              {!bulkMode ? (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Contact</label>
                  <select
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="">Select contact</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.phone} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                  {contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!selectedBulk[c.id]}
                        onChange={(e) => setSelectedBulk((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                      />
                      {c.name || 'Unknown'} ({c.phone})
                    </label>
                  ))}
                  {!contacts.length && <div className="text-sm text-slate-500">No contacts available.</div>}
                </div>
              )}

              <div className="text-xs text-slate-500">
                Estimated charge: ₹
                {bulkMode
                  ? Object.values(selectedBulk).filter(Boolean).length * messageCost
                  : selectedContactId
                    ? messageCost
                    : 0}
              </div>
              {selectedTemplate && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                  Preview: {selectedTemplate.content}
                </div>
              )}
              <button
                type="button"
                onClick={sendTemplate}
                disabled={sending}
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
              >
                {sending ? 'Sending...' : 'Send communication'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
