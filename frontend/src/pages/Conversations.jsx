import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { parseMessageContent, previewText } from '../utils/whatsappMessagePreview.js';
import { SessionBadge, MessageBadge } from '../components/ChatStatusBadges.jsx';

const POLL_MS = 4000;

function formatShortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildConversationQuery(filters) {
  const { session = [], message = [] } = filters || {};
  const p = new URLSearchParams();
  if (session.length) p.set('sessionStatus', session.join(','));
  if (message.length) p.set('messageStatus', message.join(','));
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

function bubbleMeta(type) {
  if (type === 'USER') return { align: 'left', label: 'Customer', bubble: 'incoming' };
  if (type === 'STAFF') return { align: 'right', label: 'Agent', bubble: 'staff' };
  return { align: 'right', label: 'AI', bubble: 'bot' };
}

function statusTick(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'read') return { type: 'double', cls: 'text-[#53bdeb]' };
  if (s === 'delivered') return { type: 'double', cls: 'text-white/80' };
  if (s === 'sent') return { type: 'single', cls: 'text-white/80' };
  if (s === 'pending') return { type: 'pending', cls: 'text-white/75' };
  return null;
}

function StatusMarker({ marker }) {
  if (!marker) return null;
  if (marker.type === 'pending') {
    return <span className={`${marker.cls} text-[12px] font-bold leading-none -mb-px`}>⌛</span>;
  }

  if (marker.type === 'single') {
    return (
      <svg
        className={`${marker.cls} h-[13px] w-[13px] -mb-px`}
        viewBox="0 0 12 12"
        aria-label="sent"
      >
        <polyline
          points="1.5,6.5 4.3,9.2 10.5,2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className={`${marker.cls} h-[13px] w-[18px] -mb-px`}
      viewBox="0 0 18 12"
      aria-label="delivered"
    >
      <polyline
        points="1.2,6.6 4,9.2 9.6,2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="7,6.6 9.8,9.2 15.4,2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Conversations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramCustomerId = searchParams.get('customer');

  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [mediaUrls, setMediaUrls] = useState({});
  const [catalogItems, setCatalogItems] = useState([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [filterSession, setFilterSession] = useState({
    active: false,
    expiring: false,
    expired: false,
  });
  const [filterMessage, setFilterMessage] = useState({
    sent: false,
    unread: false,
    read: false,
    replied: false,
  });
  const [templates, setTemplates] = useState([]);
  const [aiNotice, setAiNotice] = useState('');
  const [showResumeAiModal, setShowResumeAiModal] = useState(false);
  const [resumeAiMode, setResumeAiMode] = useState('NEW_MESSAGES_ONLY');
  const [loadingAiControl, setLoadingAiControl] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mediaUrlRefs = useRef({});

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) || null,
    [threads, selectedId],
  );

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        (t.phone && t.phone.toLowerCase().includes(q)) ||
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.lastMessage?.content && t.lastMessage.content.toLowerCase().includes(q)),
    );
  }, [threads, query]);

  const conversationQuerySuffix = useMemo(() => {
    const session = Object.entries(filterSession)
      .filter(([, on]) => on)
      .map(([k]) => k);
    const message = Object.entries(filterMessage)
      .filter(([, on]) => on)
      .map(([k]) => k);
    return buildConversationQuery({ session, message });
  }, [filterSession, filterMessage]);

  const loadThreads = useCallback(async () => {
    try {
      const { data } = await api.get(`/dashboard/conversations${conversationQuerySuffix}`);
      setThreads(data);
      setError('');
      return data;
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load inbox');
      return [];
    }
  }, [conversationQuerySuffix]);

  const loadMessages = useCallback(async (customerId) => {
    if (!customerId) return;
    try {
      const { data } = await api.get(`/dashboard/messages/${customerId}`);
      const list = Array.isArray(data) ? data : data?.messages ?? [];
      setMessages(list);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingThreads(true);
      const data = await loadThreads();
      if (cancelled) return;
      setLoadingThreads(false);
      const preferred =
        paramCustomerId && data.some((t) => t.id === paramCustomerId)
          ? paramCustomerId
          : data[0]?.id ?? null;
      setSelectedId((prev) =>
        prev && data.some((t) => t.id === prev) ? prev : preferred,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [loadThreads, paramCustomerId]);

  useEffect(() => {
    if (!selectedId || !threads.length) return;
    if (!threads.some((t) => t.id === selectedId)) {
      const fallback =
        paramCustomerId && threads.some((t) => t.id === paramCustomerId)
          ? paramCustomerId
          : threads[0]?.id ?? null;
      setSelectedId(fallback);
      if (fallback) {
        const next = new URLSearchParams(searchParams);
        next.set('customer', fallback);
        setSearchParams(next, { replace: true });
      }
    }
  }, [threads, selectedId, paramCustomerId, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/config');
        if (cancelled) return;
        const services = Array.isArray(data?.config?.services) ? data.config.services : [];
        const products = Array.isArray(data?.config?.products) ? data.config.products : [];
        const merged = [...services, ...products]
          .map((x) => ({
            name: x?.name || x?.title || '',
            imageUrl: x?.imageUrl || x?.image || '',
            description: x?.description || '',
          }))
          .filter((x) => x.name && x.imageUrl);
        setCatalogItems(merged);
      } catch {
        // Keep chat usable if catalog load fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/templates');
        if (cancelled) return;
        setTemplates(Array.isArray(data?.templates) ? data.templates : []);
      } catch {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setAiNotice('');
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, selectedId]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      loadThreads();
      if (selectedId) loadMessages(selectedId);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadThreads, loadMessages, selectedId]);

  useEffect(() => {
    const mediaIds = messages
      .map((m) => parseMessageContent(m.content))
      .filter((c) => ['image', 'audio', 'video', 'document', 'sticker'].includes(c.kind) && c.mediaId)
      .map((c) => c.mediaId);

    const existing = mediaUrlRefs.current;
    const needed = new Set(mediaIds);

    Object.entries(existing).forEach(([mediaId, objectUrl]) => {
      if (!needed.has(mediaId)) {
        URL.revokeObjectURL(objectUrl);
        delete existing[mediaId];
      }
    });

    const missing = mediaIds.filter((id) => !existing[id]);
    if (!missing.length) {
      setMediaUrls({ ...existing });
      return;
    }

    let cancelled = false;
    (async () => {
      for (const mediaId of missing) {
        try {
          const res = await api.get(`/dashboard/messages/media/${mediaId}`, {
            responseType: 'blob',
          });
          if (cancelled) return;
          existing[mediaId] = URL.createObjectURL(res.data);
        } catch {
          // Keep chat usable even if media fetch fails.
        }
      }
      if (!cancelled) setMediaUrls({ ...existing });
    })();

    return () => {
      cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    return () => {
      Object.values(mediaUrlRefs.current).forEach((u) => URL.revokeObjectURL(u));
      mediaUrlRefs.current = {};
    };
  }, []);

  function selectCustomer(id) {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    next.set('customer', id);
    setSearchParams(next, { replace: true });
  }

  async function send() {
    if (!draft.trim() || !selectedId) return;
    setLoadingSend(true);
    setError('');
    try {
      await api.post('/send-message', { customerId: selectedId, content: draft.trim() });
      setDraft('');
      setLoadingSend(false);
      await Promise.allSettled([loadMessages(selectedId), loadThreads()]);
    } catch (e) {
      const code = e.response?.data?.code;
      const msg = e.response?.data?.error || 'Send failed — check WhatsApp token / phone number id';
      setError(code === 'SESSION_EXPIRED' ? `${msg} Reloading inbox…` : msg);
      if (code === 'SESSION_EXPIRED') await loadThreads();
    }
    setLoadingSend(false);
  }

  async function sendFromCatalog(item) {
    if (!selectedId || !item?.imageUrl) return;
    setLoadingSend(true);
    setError('');
    try {
      await api.post('/send-message', {
        customerId: selectedId,
        imageUrl: item.imageUrl,
        content: item.name,
      });
      setShowCatalog(false);
      setLoadingSend(false);
      await Promise.allSettled([loadMessages(selectedId), loadThreads()]);
    } catch (e) {
      const code = e.response?.data?.code;
      const msg = e.response?.data?.error || 'Catalog send failed';
      setError(code === 'SESSION_EXPIRED' ? `${msg} Reloading inbox…` : msg);
      if (code === 'SESSION_EXPIRED') await loadThreads();
    }
    setLoadingSend(false);
  }

  async function sendTemplate(templateId) {
    if (!selectedId || !templateId) return;
    setLoadingSend(true);
    setError('');
    try {
      await api.post('/communications/send', {
        templateId,
        customerIds: [selectedId],
      });
      setShowCatalog(false);
      await Promise.allSettled([loadMessages(selectedId), loadThreads()]);
    } catch (e) {
      setError(
        e.response?.data?.error ||
          'Template send failed — check wallet balance and WhatsApp configuration.',
      );
    }
    setLoadingSend(false);
  }

  const sessionExpired = selected?.sessionStatus === 'expired';
  const sessionExpiring = selected?.sessionStatus === 'expiring';
  const workingTemplates = templates.filter((x) => x.status === 'WORKING');

  const aiControl = selected?.aiControl ?? null;
  const humanOverrideActive = Boolean(aiControl?.aiOverride);

  async function patchAiControl(body) {
    if (!selectedId) return;
    setLoadingAiControl(true);
    setAiNotice('');
    setError('');
    try {
      const { data } = await api.patch(`/dashboard/conversations/${selectedId}/ai-control`, body);
      setAiNotice(data?.notice || '');
      await Promise.all([loadThreads(), loadMessages(selectedId)]);
      setShowResumeAiModal(false);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not update AI mode');
    }
    setLoadingAiControl(false);
  }

  function openResumeAiModal() {
    setResumeAiMode('NEW_MESSAGES_ONLY');
    setShowResumeAiModal(true);
  }

  async function confirmResumeAi() {
    await patchAiControl({
      action: 'resume',
      resumeMode: resumeAiMode,
    });
  }

  return (
    <div className="space-y-4 -mx-2 sm:mx-0 max-w-6xl xl:max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Chats</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Same thread as WhatsApp — messages sync here every few seconds. Replies go to the customer on WhatsApp.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}
      {aiNotice && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-200 text-sm px-3 py-2">
          {aiNotice}
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-4 h-[min(720px,calc(100vh-12rem))]">
        <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
            <div className="font-semibold text-sm text-slate-900 dark:text-white">Inbox</div>
            <input
              type="search"
              placeholder="Search name, phone, or message…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <details className="text-xs text-slate-600 dark:text-slate-400">
              <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300 select-none">
                Filters
              </summary>
              <div className="mt-2 space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="font-semibold text-[11px] uppercase tracking-wide text-slate-500">
                  Session status
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {[
                    ['active', 'Active'],
                    ['expiring', 'Expiring'],
                    ['expired', 'Expired'],
                  ].map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterSession[key]}
                        onChange={(e) =>
                          setFilterSession((f) => ({ ...f, [key]: e.target.checked }))
                        }
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="font-semibold text-[11px] uppercase tracking-wide text-slate-500 pt-1">
                  Message status
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {[
                    ['sent', 'Sent'],
                    ['unread', 'Unread'],
                    ['read', 'Read'],
                    ['replied', 'Replied'],
                  ].map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterMessage[key]}
                        onChange={(e) =>
                          setFilterMessage((f) => ({ ...f, [key]: e.target.checked }))
                        }
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads && !threads.length ? (
              <div className="p-6 text-sm text-slate-500">Loading inbox…</div>
            ) : (
              filteredThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectCustomer(t.id)}
                  className={[
                    'w-full text-left px-4 py-3 text-sm border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                    selectedId === t.id ? 'bg-brand-50 dark:bg-brand-900/20' : '',
                    t.inboxUnreadCount > 0 ? 'border-l-4 border-l-sky-500 pl-3' : '',
                  ].join(' ')}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="font-medium text-slate-900 dark:text-white truncate min-w-0">
                      {t.name || 'Unknown'}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <div className="text-[11px] text-slate-400">
                        {formatShortTime(t.lastMessage?.createdAt)}
                      </div>
                      {t.inboxUnreadCount > 0 ? (
                        <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                          {t.inboxUnreadCount > 99 ? '99+' : t.inboxUnreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">{t.phone}</div>
                  {t.lastMessage && (
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {t.lastMessage.type === 'USER'
                        ? ''
                        : t.lastMessage.type === 'STAFF'
                          ? 'Agent: '
                          : 'AI: '}
                      {previewText(t.lastMessage.content)}
                    </div>
                  )}
                  {!t.lastMessage && (
                    <div className="text-xs text-slate-400 mt-1 italic">No messages yet</div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2 items-center">
                    <SessionBadge status={t.sessionStatus} />
                    <MessageBadge status={t.messageStatus} />
                    {t.aiControl?.aiOverride ? (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                        AI paused
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
            {!loadingThreads && !filteredThreads.length && (
              <div className="p-6 text-sm text-slate-500">
                {threads.length ? 'No threads match your search.' : 'No chats yet — messages will appear after WhatsApp activity.'}
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col min-h-[420px] relative">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start gap-3">
            <div className="min-w-0 space-y-1 flex-1">
              <div className="font-semibold text-slate-900 dark:text-white truncate">
                {selected?.name || 'Select a chat'}
              </div>
              <div className="text-xs text-slate-500 font-mono truncate">{selected?.phone}</div>
              {selected ? (
                <div className="flex flex-wrap gap-1 pt-0.5 items-center">
                  <SessionBadge status={selected.sessionStatus} />
                  <MessageBadge status={selected.messageStatus} />
                  <span
                    className={[
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      humanOverrideActive
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200',
                    ].join(' ')}
                  >
                    {humanOverrideActive ? 'AI paused' : 'AI active'}
                  </span>
                  {!humanOverrideActive ? (
                    <button
                      type="button"
                      disabled={loadingAiControl || !selectedId}
                      onClick={() => patchAiControl({ action: 'override' })}
                      className="rounded-full border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      Override AI
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={loadingAiControl || !selectedId}
                      onClick={openResumeAiModal}
                      className="rounded-full border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
                    >
                      Back to AI
                    </button>
                  )}
                </div>
              ) : null}
              {sessionExpiring && selected ? (
                <div className="text-xs font-medium text-amber-700 dark:text-amber-300 pt-1">
                  Session expiring soon — reply before the 24-hour window closes.
                </div>
              ) : null}
              {sessionExpired && selected ? (
                <div className="text-xs font-medium text-red-700 dark:text-red-300 pt-1">
                  24-hour session expired. Send template message to reopen chat.
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 hidden sm:block">
                Live sync ~{POLL_MS / 1000}s
              </span>
            </div>
          </div>
          {humanOverrideActive && selected ? (
            <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40 text-xs text-amber-950 dark:text-amber-100">
              <div className="font-semibold">Human agent is handling this conversation.</div>
              {aiControl?.pausedByEmail ? (
                <div className="mt-0.5 opacity-90">AI paused by {aiControl.pausedByEmail}</div>
              ) : null}
            </div>
          ) : null}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60 dark:bg-slate-950/40"
          >
            {messages.map((m) => {
              const meta = bubbleMeta(m.type);
              const incoming = meta.bubble === 'incoming';
              return (
                <div
                  key={m.id}
                  className={incoming ? 'flex justify-start' : 'flex justify-end'}
                >
                  <div
                    className={[
                      'max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      incoming
                        ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                        : meta.bubble === 'staff'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-brand-600 text-white',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'text-[10px] uppercase tracking-wide mb-1 opacity-80',
                        incoming ? 'text-slate-500' : 'text-white/80',
                      ].join(' ')}
                    >
                      {meta.label}
                    </div>
                    {(() => {
                      const parsed = parseMessageContent(m.content);
                      const mediaSrc = parsed.mediaId ? mediaUrls[parsed.mediaId] : '';

                      if (parsed.kind === 'image') {
                        const resolvedImageSrc = mediaSrc || parsed.imageUrl || '';
                        const fromCatalog = parsed.source === 'product' || parsed.source === 'service';
                        return (
                          <div className="space-y-2">
                            {resolvedImageSrc ? (
                              <img
                                src={resolvedImageSrc}
                                alt={parsed.caption || 'Customer image'}
                                className="max-h-72 rounded-xl border border-slate-200 dark:border-slate-700 object-contain bg-black/5"
                              />
                            ) : (
                              <div className="text-xs opacity-80">Loading image…</div>
                            )}
                            {parsed.caption ? (
                              <div className="whitespace-pre-wrap break-words">{parsed.caption}</div>
                            ) : null}
                            {fromCatalog ? (
                              <div
                                className={[
                                  'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  incoming
                                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                    : 'bg-white/20 text-white',
                                ].join(' ')}
                              >
                                Sent from catalog
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      if (parsed.kind === 'audio') {
                        return (
                          <div className="space-y-2">
                            {mediaSrc ? (
                              <audio controls src={mediaSrc} className="max-w-full" />
                            ) : (
                              <div className="text-xs opacity-80">Loading audio…</div>
                            )}
                            {parsed.voice ? <div className="text-xs opacity-70">Voice note</div> : null}
                          </div>
                        );
                      }
                      if (parsed.kind === 'video') {
                        return (
                          <div className="space-y-2">
                            {mediaSrc ? (
                              <video controls src={mediaSrc} className="max-h-72 rounded-xl max-w-full bg-black" />
                            ) : (
                              <div className="text-xs opacity-80">Loading video…</div>
                            )}
                            {parsed.caption ? (
                              <div className="whitespace-pre-wrap break-words">{parsed.caption}</div>
                            ) : null}
                          </div>
                        );
                      }
                      if (parsed.kind === 'document') {
                        return (
                          <div className="space-y-1">
                            <div className="font-medium">{parsed.filename || 'Document'}</div>
                            {mediaSrc ? (
                              <a
                                href={mediaSrc}
                                download={parsed.filename || 'document'}
                                target="_blank"
                                rel="noreferrer"
                                className="underline text-sm"
                              >
                                Open / Download
                              </a>
                            ) : (
                              <div className="text-xs opacity-80">Loading document…</div>
                            )}
                            {parsed.caption ? (
                              <div className="whitespace-pre-wrap break-words">{parsed.caption}</div>
                            ) : null}
                          </div>
                        );
                      }
                      if (parsed.kind === 'sticker') {
                        return mediaSrc ? (
                          <img
                            src={mediaSrc}
                            alt="Sticker"
                            className="max-h-56 max-w-56 rounded-xl object-contain bg-black/5"
                          />
                        ) : (
                          <div className="text-xs opacity-80">Loading sticker…</div>
                        );
                      }
                      if (parsed.kind === 'location') {
                        const lat = parsed.latitude;
                        const lng = parsed.longitude;
                        const mapUrl =
                          Number.isFinite(lat) && Number.isFinite(lng)
                            ? `https://maps.google.com/?q=${lat},${lng}`
                            : '';
                        return (
                          <div className="space-y-1">
                            <div>{parsed.name || 'Location'}</div>
                            {parsed.address ? <div className="text-xs opacity-80">{parsed.address}</div> : null}
                            {mapUrl ? (
                              <a href={mapUrl} target="_blank" rel="noreferrer" className="underline text-sm">
                                Open in maps
                              </a>
                            ) : null}
                          </div>
                        );
                      }
                      if (parsed.kind === 'contacts') {
                        const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
                        return (
                          <div className="space-y-1">
                            <div>Contact card{contacts.length > 1 ? 's' : ''}</div>
                            <div className="text-xs opacity-80">
                              {contacts
                                .map((c) => c?.name?.formatted_name || c?.name?.first_name || 'Contact')
                                .join(', ')}
                            </div>
                          </div>
                        );
                      }
                      if (parsed.kind === 'button') {
                        return (
                          <div className="whitespace-pre-wrap break-words">
                            {parsed.text || parsed.payload || 'Button reply'}
                          </div>
                        );
                      }
                      if (parsed.kind === 'interactive') {
                        const label =
                          parsed.buttonReply?.title ||
                          parsed.listReply?.title ||
                          parsed.nfmReply?.body ||
                          'Interactive reply';
                        return <div className="whitespace-pre-wrap break-words">{label}</div>;
                      }
                      if (parsed.kind === 'reaction') {
                        return <div className="text-2xl leading-none">{parsed.emoji || 'Reaction'}</div>;
                      }
                      return <div className="whitespace-pre-wrap break-words">{parsed.text}</div>;
                    })()}
                    <div
                      className={[
                        'text-[10px] mt-1 opacity-80 flex items-center gap-1.5',
                        incoming ? 'text-slate-400' : 'text-white/80',
                      ].join(' ')}
                    >
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                      {(() => {
                        if (incoming) return null;
                        const parsed = parseMessageContent(m.content);
                        const marker = statusTick(parsed.status);
                        if (!marker) return null;
                        return <StatusMarker marker={marker} />;
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
            {!messages.length && selected && (
              <div className="text-sm text-slate-500 text-center py-12">
                No messages yet. When this customer writes on WhatsApp, the thread shows up here.
              </div>
            )}
            {!selected && (
              <div className="text-sm text-slate-500 text-center py-12">
                Choose a customer from the inbox to chat.
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <button
              type="button"
              disabled={!selected || loadingSend || sessionExpired}
              onClick={() => setShowCatalog((v) => !v)}
              className="self-end rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold disabled:opacity-50 shrink-0"
            >
              Send from catalog
            </button>
            <textarea
              rows={2}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm resize-none disabled:opacity-60"
              placeholder={
                sessionExpired && selected
                  ? 'Session expired — use template send below'
                  : selected
                    ? 'Type a message — sends on WhatsApp…'
                    : 'Select a chat first'
              }
              value={draft}
              disabled={!selected || sessionExpired}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              disabled={loadingSend || !selected || sessionExpired}
              onClick={send}
              className="self-end rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              {loadingSend ? '…' : 'Send'}
            </button>
          </div>
          {sessionExpired && selected && (
            <div className="px-3 pb-2 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Template / campaign send (wallet charged per message)
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 max-h-40 overflow-y-auto space-y-1.5">
                {workingTemplates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    disabled={loadingSend}
                    onClick={() => sendTemplate(tmpl.id)}
                    className="w-full text-left rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {tmpl.name}
                  </button>
                ))}
                {!workingTemplates.length && (
                  <div className="text-xs text-slate-500 px-2 py-2">
                    No working templates — create one under Communications. Sends use your wallet balance.
                  </div>
                )}
              </div>
            </div>
          )}
          {showCatalog && (
            <div className="px-3 pb-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 max-h-44 overflow-y-auto space-y-2">
                {catalogItems.map((item) => (
                  <button
                    key={`${item.name}-${item.imageUrl}`}
                    type="button"
                    onClick={() => sendFromCatalog(item)}
                    className="w-full text-left rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <img src={item.imageUrl} alt={item.name} className="h-10 w-10 rounded object-cover" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{item.description || item.imageUrl}</div>
                    </div>
                  </button>
                ))}
                {!catalogItems.length && (
                  <div className="text-xs text-slate-500 px-2 py-1">No catalog images found in Settings.</div>
                )}
              </div>
            </div>
          )}
          {showResumeAiModal && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4 rounded-2xl">
              <div
                role="dialog"
                aria-modal="true"
                className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-4 space-y-4"
              >
                <div className="font-semibold text-slate-900 dark:text-white">Resume AI</div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Resume AI from:</p>
                <div className="space-y-3 text-sm">
                  <label className="flex gap-2 cursor-pointer items-start">
                    <input
                      type="radio"
                      name="resumeAiMode"
                      checked={resumeAiMode === 'NEW_MESSAGES_ONLY'}
                      onChange={() => setResumeAiMode('NEW_MESSAGES_ONLY')}
                      className="mt-1 rounded-full border-slate-300"
                    />
                    <span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        New incoming messages only
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Recommended — AI waits for the customer&apos;s next message before replying.
                      </span>
                    </span>
                  </label>
                  <label className="flex gap-2 cursor-pointer items-start">
                    <input
                      type="radio"
                      name="resumeAiMode"
                      checked={resumeAiMode === 'LAST_CUSTOMER_MESSAGE'}
                      onChange={() => setResumeAiMode('LAST_CUSTOMER_MESSAGE')}
                      className="mt-1 rounded-full border-slate-300"
                    />
                    <span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        Last customer message
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        AI replies immediately using the latest customer message (requires an active WhatsApp session).
                      </span>
                    </span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResumeAiModal(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loadingAiControl}
                    onClick={confirmResumeAi}
                    className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    Resume AI
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
