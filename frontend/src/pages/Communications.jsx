import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function Communications() {
  const TXN_PAGE_SIZE = 20;
  const tabs = ['WALLET', 'SEND', 'TEMPLATES', 'CONTACTS'];
  const [wallet, setWallet] = useState(null);
  const [walletTxns, setWalletTxns] = useState([]);
  const [txnFilter, setTxnFilter] = useState('ALL');
  const [txnOffset, setTxnOffset] = useState(0);
  const [txnHasMore, setTxnHasMore] = useState(false);
  const [txnLoading, setTxnLoading] = useState(false);
  const [messageCost, setMessageCost] = useState(2);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [addAmount, setAddAmount] = useState('');
  const [csvText, setCsvText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedBulk, setSelectedBulk] = useState({});
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('WALLET');

  const selectedTemplate = useMemo(
    () => asArray(templates).find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  async function loadWalletTransactions({ filter = txnFilter, offset = 0, append = false } = {}) {
    setTxnLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(TXN_PAGE_SIZE));
      params.set('offset', String(offset));
      if (filter !== 'ALL') params.set('type', filter);
      const { data } = await api.get(`/wallet/transactions?${params.toString()}`);
      const rows = asArray(data?.rows);
      setWalletTxns((prev) => (append ? [...prev, ...rows] : rows));
      setTxnOffset(data?.nextOffset ?? offset + rows.length);
      setTxnHasMore(Boolean(data?.hasMore));
    } finally {
      setTxnLoading(false);
    }
  }

  async function loadAll() {
    const [walletRes, contactsRes, templatesRes] = await Promise.all([
      api.get('/wallet'),
      api.get('/contacts'),
      api.get('/templates'),
    ]);
    const contactsData = asArray(contactsRes.data);
    const templatesData = asArray(templatesRes.data);
    setWallet(walletRes.data.wallet);
    setMessageCost(Number(walletRes.data.messageCost || 2));
    setContacts(contactsData);
    setTemplates(templatesData);
    setSelectedTemplateId((prev) => prev || templatesData?.[0]?.id || '');
    setSelectedContactId((prev) => prev || contactsData?.[0]?.id || '');
    await loadWalletTransactions({ filter: txnFilter, offset: 0, append: false });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAll();
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load communication data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addMoney() {
    if (!addAmount) return;
    setError('');
    setInfo('');
    try {
      await api.post('/wallet/add-money', { amount: Number(addAmount) });
      setAddAmount('');
      await loadAll();
      setInfo('Wallet updated');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not add money');
    }
  }

  async function uploadContacts() {
    if (!csvText.trim()) return;
    setError('');
    setInfo('');
    try {
      const { data } = await api.post('/contacts/upload', { csvText });
      setCsvText('');
      await loadAll();
      setInfo(`Uploaded contacts: ${data.inserted}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed');
    }
  }

  async function createTemplate() {
    if (!templateName.trim() || !templateContent.trim()) return;
    setError('');
    setInfo('');
    try {
      await api.post('/templates', { name: templateName, content: templateContent });
      setTemplateName('');
      setTemplateContent('');
      await loadAll();
      setInfo('Template created');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create template');
    }
  }

  async function updateTemplateStatus(id, status) {
    setError('');
    setInfo('');
    try {
      await api.patch(`/templates/${id}/status`, { status });
      await loadAll();
      setInfo('Template status updated');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not update template status');
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
      setInfo(
        `Sent: ${data.sentCount}, Failed: ${data.failedCount}, Wallet balance: ₹${Number(data.walletBalance).toLocaleString('en-IN')}`,
      );
      await loadAll();
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

  async function loadMoreTxns() {
    if (!txnHasMore || txnLoading) return;
    await loadWalletTransactions({ filter: txnFilter, offset: txnOffset, append: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Communications</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Upload contacts, manage templates, and send single or bulk communications.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      {info && <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">{info}</div>}

      <div className="grid lg:grid-cols-[260px_1fr] gap-4 items-start">
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
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
              >
                Add money
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
                className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold"
              >
                Upload
              </button>
            </div>
          )}

          {activeTab === 'TEMPLATES' && (
            <>
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
            <button
              type="button"
              onClick={createTemplate}
              className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
            >
              Create template
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">Templates</div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Content</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-md truncate">{t.content}</td>
                    <td className="px-4 py-3">{t.status}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-emerald-700"
                        onClick={() => updateTemplateStatus(t.id, 'WORKING')}
                      >
                        Mark working
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-700"
                        onClick={() => updateTemplateStatus(t.id, 'NOT_WORKING')}
                      >
                        Mark not working
                      </button>
                    </td>
                  </tr>
                ))}
                {!templates.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No templates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
