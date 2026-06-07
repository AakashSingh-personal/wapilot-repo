import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { parseMessageContent, previewText } from '../utils/whatsappMessagePreview.js';
import { SessionBadge, MessageBadge } from '../components/ChatStatusBadges.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  subscribeRealtime,
  subscribeConnectionState,
  onReconnect,
  sendAgentTyping,
  sendAgentViewing,
} from '../realtime/socket.js';
import { createInboxEventHandler } from '../realtime/eventHandlers.js';
import {
  Search, SlidersHorizontal, Send, Image, Wifi, WifiOff,
  BotMessageSquare, UserCircle, Pencil, X, Check, AlertCircle,
  Package, ChevronDown, ChevronUp, Mic, FileText, MapPin,
  Smile, Phone as PhoneIcon,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Modal } from '../components/ui/Modal.jsx';

const FALLBACK_POLL_MS = 60_000;

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
      <svg className={`${marker.cls} h-[13px] w-[13px] -mb-px`} viewBox="0 0 12 12" aria-label="sent">
        <polyline points="1.5,6.5 4.3,9.2 10.5,2.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className={`${marker.cls} h-[13px] w-[18px] -mb-px`} viewBox="0 0 18 12" aria-label="delivered">
      <polyline points="1.2,6.6 4,9.2 9.6,2.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7,6.6 9.8,9.2 15.4,2.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Conversations() {
  const { user } = useAuth();
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
  const [showFilters, setShowFilters] = useState(false);
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
  const [editingCustomerProfile, setEditingCustomerProfile] = useState(false);
  const [customerProfileDraft, setCustomerProfileDraft] = useState({ name: '', email: '' });
  const [savingCustomerProfile, setSavingCustomerProfile] = useState(false);
  const [loadingAiControl, setLoadingAiControl] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeSyncError, setRealtimeSyncError] = useState('');
  const [presenceTypingName, setPresenceTypingName] = useState('');
  const [presenceViewingName, setPresenceViewingName] = useState('');

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mediaUrlRefs = useRef({});
  const selectedIdRef = useRef(null);
  const typingIdleTimerRef = useRef(null);
  const presenceTypingClearRef = useRef(null);
  const presenceViewingClearRef = useRef(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    setEditingCustomerProfile(false);
  }, [selectedId]);

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

  const applyWsInboxRow = useCallback((row) => {
    if (!row?.id) return;
    setThreads((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      const prevRow = map.get(row.id);
      map.set(row.id, prevRow ? { ...prevRow, ...row } : row);
      const list = Array.from(map.values());
      list.sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      return list;
    });
  }, []);

  const applyWsMessage = useCallback((msg, customerId) => {
    if (!msg?.id || !customerId) return;
    setMessages((prev) => {
      if (selectedIdRef.current !== customerId) return prev;
      const next = new Map(prev.map((m) => [m.id, m]));
      const existing = next.get(msg.id);
      next.set(msg.id, existing ? { ...existing, ...msg } : msg);
      return Array.from(next.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  const hasActiveConversationFilters = useCallback(
    () => conversationQuerySuffix.length > 0,
    [conversationQuerySuffix],
  );

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
      if (customerId !== selectedIdRef.current) return;
      const list = Array.isArray(data) ? data : data?.messages ?? [];
      setMessages(list);
      const ai = data && !Array.isArray(data) ? data.aiControl : null;
      if (ai && customerId) {
        setThreads((prev) =>
          prev.map((t) => (t.id === customerId ? { ...t, aiControl: ai } : t)),
        );
      }
    } catch (e) {
      if (customerId !== selectedIdRef.current) return;
      setError(e.response?.data?.error || 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    setPresenceTypingName('');
    setPresenceViewingName('');
  }, [selectedId]);

  useEffect(() => {
    let fallbackTimer = null;
    const clearFallback = () => {
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
    };
    const startFallback = () => {
      clearFallback();
      fallbackTimer = setInterval(() => {
        if (document.hidden) return;
        void loadThreads();
        const sid = selectedIdRef.current;
        if (sid) void loadMessages(sid);
      }, FALLBACK_POLL_MS);
    };

    const unsubConn = subscribeConnectionState((connected) => {
      setRealtimeConnected(connected);
      if (connected) { setRealtimeSyncError(''); clearFallback(); }
      else { startFallback(); }
    });

    const handler = createInboxEventHandler({
      loadThreads,
      loadMessages,
      getSelectedCustomerId: () => selectedIdRef.current,
      hasActiveConversationFilters,
      applyWsInboxRow,
      applyWsMessage,
      onAuthError: () => {
        setRealtimeSyncError(
          'Live sync failed (check VITE_API_URL matches your API, JWT, and that WebSockets are allowed). Inbox still loads over HTTP.',
        );
      },
      onAgentTyping: (evt) => {
        const uid = String(evt.userId || '');
        if (user?.id && uid === user.id) return;
        const cid = String(evt.customerId || '');
        if (cid !== selectedIdRef.current) return;
        if (evt.typing) {
          if (presenceTypingClearRef.current) clearTimeout(presenceTypingClearRef.current);
          setPresenceTypingName(String(evt.agentName || 'Teammate'));
          presenceTypingClearRef.current = setTimeout(() => setPresenceTypingName(''), 4500);
        } else {
          setPresenceTypingName('');
          if (presenceTypingClearRef.current) clearTimeout(presenceTypingClearRef.current);
        }
      },
      onAgentViewing: (evt) => {
        const uid = String(evt.userId || '');
        if (user?.id && uid === user.id) return;
        const cid = String(evt.customerId || '');
        if (cid !== selectedIdRef.current) return;
        if (evt.viewing) {
          if (presenceViewingClearRef.current) clearTimeout(presenceViewingClearRef.current);
          setPresenceViewingName(String(evt.agentName || 'Teammate'));
          presenceViewingClearRef.current = setTimeout(() => setPresenceViewingName(''), 8000);
        } else {
          setPresenceViewingName('');
          if (presenceViewingClearRef.current) clearTimeout(presenceViewingClearRef.current);
        }
      },
    });
    const unsubRt = subscribeRealtime(handler);
    const unsubRc = onReconnect(() => {
      void loadThreads();
      const sid = selectedIdRef.current;
      if (sid) void loadMessages(sid);
    });

    return () => {
      unsubConn();
      unsubRt();
      unsubRc();
      clearFallback();
    };
  }, [
    loadThreads,
    loadMessages,
    user?.id,
    user?.email,
    hasActiveConversationFilters,
    applyWsInboxRow,
    applyWsMessage,
  ]);

  useEffect(() => {
    if (!selectedId || !user?.email) return undefined;
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = setTimeout(() => {
      sendAgentTyping({
        customerId: selectedId,
        typing: draft.trim().length > 0,
        agentName: user.email,
      });
    }, 400);
    return () => {
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      sendAgentTyping({ customerId: selectedId, typing: false, agentName: user.email });
    };
  }, [draft, selectedId, user?.email]);

  useEffect(() => {
    if (!user?.email) return undefined;
    if (selectedId) {
      sendAgentViewing({ customerId: selectedId, viewing: true, agentName: user.email });
    }
    return () => {
      if (selectedId) {
        sendAgentViewing({ customerId: selectedId, viewing: false, agentName: user.email });
      }
    };
  }, [selectedId, user?.email]);

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
      setSelectedId((prev) => {
        if (paramCustomerId && data.some((t) => t.id === paramCustomerId)) {
          return paramCustomerId;
        }
        if (prev && data.some((t) => t.id === prev)) return prev;
        return preferred;
      });
    })();
    return () => { cancelled = true; };
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
    if (!paramCustomerId || !threads.some((t) => t.id === paramCustomerId)) return;
    if (paramCustomerId !== selectedId) setSelectedId(paramCustomerId);
  }, [paramCustomerId, threads, selectedId]);

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
    return () => { cancelled = true; };
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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setMessages([]);
    setAiNotice('');
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, selectedId]);

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
    if (!missing.length) { setMediaUrls({ ...existing }); return; }

    let cancelled = false;
    (async () => {
      for (const mediaId of missing) {
        try {
          const res = await api.get(`/dashboard/messages/media/${mediaId}`, { responseType: 'blob' });
          if (cancelled) return;
          existing[mediaId] = URL.createObjectURL(res.data);
        } catch {
          // Keep chat usable even if media fetch fails.
        }
      }
      if (!cancelled) setMediaUrls({ ...existing });
    })();

    return () => { cancelled = true; };
  }, [messages]);

  useEffect(() => {
    return () => {
      Object.values(mediaUrlRefs.current).forEach((u) => URL.revokeObjectURL(u));
      mediaUrlRefs.current = {};
    };
  }, []);

  function selectCustomer(id) {
    if (id === selectedId) return;
    setMessages([]);
    setDraft('');
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
      await api.post('/send-message', { customerId: selectedId, imageUrl: item.imageUrl, content: item.name });
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
      await api.post('/communications/send', { templateId, customerIds: [selectedId] });
      setShowCatalog(false);
      await Promise.allSettled([loadMessages(selectedId), loadThreads()]);
    } catch (e) {
      const d = e.response?.data;
      const failedRow = Array.isArray(d?.results) ? d.results.find((r) => r.status === 'failed') : null;
      setError(
        failedRow?.error ||
          d?.error ||
          'Template send failed — check wallet balance, template approval, and WhatsApp configuration.',
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
    await patchAiControl({ action: 'resume', resumeMode: resumeAiMode });
  }

  function startEditCustomerProfile() {
    if (!selected) return;
    setCustomerProfileDraft({ name: selected.name || '', email: selected.email || '' });
    setEditingCustomerProfile(true);
  }

  async function saveCustomerProfile(e) {
    e.preventDefault();
    if (!selectedId) return;
    setSavingCustomerProfile(true);
    setError('');
    try {
      const { data } = await api.patch(`/dashboard/customers/${selectedId}`, customerProfileDraft);
      setThreads((prev) =>
        prev.map((t) => (t.id === selectedId ? { ...t, name: data.name, email: data.email } : t)),
      );
      setEditingCustomerProfile(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update customer');
    }
    setSavingCustomerProfile(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const activeFilterCount =
    Object.values(filterSession).filter(Boolean).length +
    Object.values(filterMessage).filter(Boolean).length;

  return (
    <div className="space-y-4 max-w-[1200px]">
      <PageHeader
        title="Chats"
        subtitle="WhatsApp inbox — messages sync in real time via WebSocket."
        actions={
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {realtimeConnected ? (
              <><Wifi className="w-3.5 h-3.5 text-emerald-500" /> Live</>
            ) : (
              <><WifiOff className="w-3.5 h-3.5 text-neutral-400" /> Fallback ~{FALLBACK_POLL_MS / 1000}s</>
            )}
          </div>
        }
      />

      {/* Banners */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {realtimeSyncError && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {realtimeSyncError}
        </div>
      )}
      {aiNotice && (
        <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm px-4 py-3">
          <BotMessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
          {aiNotice}
        </div>
      )}

      {/* 2-panel layout */}
      <div className="grid md:grid-cols-5 gap-4 h-[min(720px,calc(100vh-11rem))]">

        {/* ── LEFT: Inbox ────────────────────────────────────────────────── */}
        <div className="md:col-span-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col overflow-hidden">

          {/* Inbox header */}
          <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Inbox</span>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  showFilters || activeFilterCount > 0
                    ? 'bg-brand-100 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Search name, phone, message…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>

            {/* Filters panel */}
            {showFilters && (
              <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 space-y-2.5 text-xs">
                <div>
                  <div className="font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Session</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {[['active', 'Active'], ['expiring', 'Expiring'], ['expired', 'Expired']].map(([k, l]) => (
                      <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={filterSession[k]}
                          onChange={(e) => setFilterSession((f) => ({ ...f, [k]: e.target.checked }))}
                          className="rounded border-neutral-300 dark:border-neutral-600 accent-brand-600"
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Message</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {[['sent', 'Sent'], ['unread', 'Unread'], ['read', 'Read'], ['replied', 'Replied']].map(([k, l]) => (
                      <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={filterMessage[k]}
                          onChange={(e) => setFilterMessage((f) => ({ ...f, [k]: e.target.checked }))}
                          className="rounded border-neutral-300 dark:border-neutral-600 accent-brand-600"
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-50 dark:divide-neutral-800/50">
            {loadingThreads && !threads.length ? (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 animate-[shimmer_1.4s_ease-in-out_infinite] bg-[length:400%_100%] bg-gradient-to-r from-neutral-100 via-neutral-50 to-neutral-100 dark:from-neutral-800 dark:via-neutral-700/50 dark:to-neutral-800" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-800 w-3/4 animate-[shimmer_1.4s_ease-in-out_infinite]" />
                      <div className="h-2.5 rounded bg-neutral-100 dark:bg-neutral-800 w-1/2 animate-[shimmer_1.4s_ease-in-out_infinite]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              filteredThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectCustomer(t.id)}
                  className={[
                    'w-full text-left px-4 py-3 transition-colors',
                    selectedId === t.id
                      ? 'bg-brand-50 dark:bg-brand-900/20'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                    t.inboxUnreadCount > 0 ? 'border-l-[3px] border-l-brand-500 pl-[13px]' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={t.name || t.phone} size="sm" className="shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={[
                          'text-sm truncate min-w-0',
                          t.inboxUnreadCount > 0
                            ? 'font-bold text-neutral-900 dark:text-neutral-50'
                            : 'font-medium text-neutral-800 dark:text-neutral-200',
                        ].join(' ')}>
                          {t.name || 'Unknown'}
                        </span>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] text-neutral-400">
                            {formatShortTime(t.lastMessage?.createdAt)}
                          </span>
                          {t.inboxUnreadCount > 0 && (
                            <span className="inline-flex min-w-[1.2rem] justify-center rounded-full bg-brand-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                              {t.inboxUnreadCount > 99 ? '99+' : t.inboxUnreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-400 truncate mt-0.5">{t.phone}</div>
                      {t.lastMessage ? (
                        <div className={[
                          'text-xs mt-1 truncate',
                          t.inboxUnreadCount > 0 ? 'text-neutral-700 dark:text-neutral-300 font-medium' : 'text-neutral-500',
                        ].join(' ')}>
                          {t.lastMessage.type === 'USER' ? '' : t.lastMessage.type === 'STAFF' ? 'Agent: ' : 'AI: '}
                          {previewText(t.lastMessage.content)}
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400 mt-1 italic">No messages yet</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                        <SessionBadge status={t.sessionStatus} />
                        <MessageBadge status={t.messageStatus} />
                        {t.aiControl?.aiOverride && (
                          <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                            AI paused
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
            {!loadingThreads && !filteredThreads.length && (
              <div className="p-8 text-center text-sm text-neutral-500">
                {threads.length
                  ? 'No threads match your search.'
                  : 'No chats yet — messages appear after WhatsApp activity.'}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Chat panel ───────────────────────────────────────────── */}
        <div className="md:col-span-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col min-h-[420px] overflow-hidden">

          {/* Chat header */}
          <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {selected ? (
                  <Avatar name={selected.name || selected.phone} size="sm" className="shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {selected?.name || 'Select a chat'}
                  </div>
                  <div className="text-xs font-mono text-neutral-400 truncate">{selected?.phone}</div>
                </div>
              </div>
            </div>

            {/* Customer profile edit */}
            {selected && !editingCustomerProfile && (
              <div className="text-xs text-neutral-500 flex items-center gap-1 pl-11">
                <span>{selected.email || 'No email — add for reminders'}</span>
                <button
                  type="button"
                  onClick={startEditCustomerProfile}
                  className="text-brand-600 font-semibold inline-flex items-center gap-0.5 hover:text-brand-700"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </div>
            )}
            {selected && editingCustomerProfile && (
              <form onSubmit={saveCustomerProfile} className="flex flex-wrap gap-1.5 pt-1 pl-11">
                <input
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1 text-xs min-w-[100px] focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Name"
                  value={customerProfileDraft.name}
                  onChange={(e) => setCustomerProfileDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <input
                  type="email"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1 text-xs min-w-[140px] focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Email"
                  value={customerProfileDraft.email}
                  onChange={(e) => setCustomerProfileDraft((d) => ({ ...d, email: e.target.value }))}
                />
                <Button type="submit" size="xs" variant="primary" loading={savingCustomerProfile}>
                  Save
                </Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => setEditingCustomerProfile(false)}>
                  Cancel
                </Button>
              </form>
            )}

            {/* Status badges + AI controls */}
            {selected && (
              <div className="flex flex-wrap items-center gap-1.5 pl-11">
                <SessionBadge status={selected.sessionStatus} />
                <MessageBadge status={selected.messageStatus} />
                <span className={[
                  'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  humanOverrideActive
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200',
                ].join(' ')}>
                  {humanOverrideActive ? 'AI paused' : 'AI active'}
                </span>
                {!humanOverrideActive ? (
                  <button
                    type="button"
                    disabled={loadingAiControl || !selectedId}
                    onClick={() => patchAiControl({ action: 'override' })}
                    className="rounded-full border border-neutral-300 dark:border-neutral-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                  >
                    Override AI
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={loadingAiControl || !selectedId}
                    onClick={openResumeAiModal}
                    className="rounded-full border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 transition-colors"
                  >
                    Back to AI
                  </button>
                )}
              </div>
            )}

            {/* Session warnings */}
            {sessionExpiring && selected && (
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300 pl-11">
                Session expiring soon — reply before the 24-hour window closes.
              </div>
            )}
            {sessionExpired && selected && (
              <div className="text-xs font-medium text-red-700 dark:text-red-300 pl-11">
                24-hour session expired. Send a template to reopen the chat.
              </div>
            )}

            {/* Presence indicators */}
            {presenceTypingName && (
              <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 pl-11">
                {presenceTypingName} is typing…
              </div>
            )}
            {presenceViewingName && (
              <div className="text-xs text-neutral-500 pl-11">
                {presenceViewingName} is viewing this chat
              </div>
            )}
          </div>

          {/* Human-override banner */}
          {humanOverrideActive && selected && (
            <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40 text-xs text-amber-950 dark:text-amber-100">
              <span className="font-semibold">Human agent is handling this conversation.</span>
              {aiControl?.pausedByEmail && (
                <span className="ml-2 opacity-90">AI paused by {aiControl.pausedByEmail}</span>
              )}
            </div>
          )}

          {/* Messages area */}
          <div
            key={selectedId ?? 'none'}
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50/60 dark:bg-neutral-950/40"
          >
            {messages.map((m) => {
              const meta = bubbleMeta(m.type);
              const incoming = meta.bubble === 'incoming';
              return (
                <div key={m.id} className={incoming ? 'flex justify-start' : 'flex justify-end'}>
                  <div className={[
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs',
                    incoming
                      ? 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800'
                      : meta.bubble === 'staff'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-brand-600 text-white',
                  ].join(' ')}>
                    <div className={[
                      'text-[10px] uppercase tracking-wider mb-1.5 font-semibold',
                      incoming ? 'text-neutral-400' : 'text-white/70',
                    ].join(' ')}>
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
                                className="max-h-72 rounded-xl border border-neutral-200 dark:border-neutral-700 object-contain bg-black/5"
                              />
                            ) : (
                              <div className="text-xs opacity-80">Loading image…</div>
                            )}
                            {parsed.caption && <div className="whitespace-pre-wrap break-words">{parsed.caption}</div>}
                            {fromCatalog && (
                              <span className={[
                                'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                incoming ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300' : 'bg-white/20 text-white',
                              ].join(' ')}>
                                Sent from catalog
                              </span>
                            )}
                          </div>
                        );
                      }
                      if (parsed.kind === 'audio') {
                        return (
                          <div className="space-y-2">
                            {mediaSrc ? (
                              <audio controls src={mediaSrc} className="max-w-full" />
                            ) : (
                              <div className="text-xs opacity-80 flex items-center gap-1"><Mic className="w-3 h-3" /> Loading audio…</div>
                            )}
                            {parsed.voice && <div className="text-xs opacity-70">Voice note</div>}
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
                            {parsed.caption && <div className="whitespace-pre-wrap break-words">{parsed.caption}</div>}
                          </div>
                        );
                      }
                      if (parsed.kind === 'document') {
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-medium">
                              <FileText className="w-4 h-4 shrink-0" />
                              {parsed.filename || 'Document'}
                            </div>
                            {mediaSrc ? (
                              <a href={mediaSrc} download={parsed.filename || 'document'} target="_blank" rel="noreferrer" className="underline text-sm">
                                Open / Download
                              </a>
                            ) : (
                              <div className="text-xs opacity-80">Loading document…</div>
                            )}
                            {parsed.caption && <div className="whitespace-pre-wrap break-words">{parsed.caption}</div>}
                          </div>
                        );
                      }
                      if (parsed.kind === 'sticker') {
                        return mediaSrc ? (
                          <img src={mediaSrc} alt="Sticker" className="max-h-56 max-w-56 rounded-xl object-contain bg-black/5" />
                        ) : (
                          <div className="text-xs opacity-80">Loading sticker…</div>
                        );
                      }
                      if (parsed.kind === 'location') {
                        const lat = parsed.latitude;
                        const lng = parsed.longitude;
                        const mapUrl = Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.google.com/?q=${lat},${lng}` : '';
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{parsed.name || 'Location'}</div>
                            {parsed.address && <div className="text-xs opacity-80">{parsed.address}</div>}
                            {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="underline text-sm">Open in maps</a>}
                          </div>
                        );
                      }
                      if (parsed.kind === 'contacts') {
                        const cs = Array.isArray(parsed.contacts) ? parsed.contacts : [];
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1"><UserCircle className="w-3.5 h-3.5" />Contact card{cs.length > 1 ? 's' : ''}</div>
                            <div className="text-xs opacity-80">
                              {cs.map((c) => c?.name?.formatted_name || c?.name?.first_name || 'Contact').join(', ')}
                            </div>
                          </div>
                        );
                      }
                      if (parsed.kind === 'button') {
                        return <div className="whitespace-pre-wrap break-words">{parsed.text || parsed.payload || 'Button reply'}</div>;
                      }
                      if (parsed.kind === 'interactive') {
                        const label = parsed.buttonReply?.title || parsed.listReply?.title || parsed.nfmReply?.body || 'Interactive reply';
                        return <div className="whitespace-pre-wrap break-words">{label}</div>;
                      }
                      if (parsed.kind === 'reaction') {
                        return <div className="text-2xl leading-none">{parsed.emoji || 'Reaction'}</div>;
                      }
                      return <div className="whitespace-pre-wrap break-words">{parsed.text}</div>;
                    })()}
                    <div className={[
                      'text-[10px] mt-1.5 flex items-center gap-1.5',
                      incoming ? 'text-neutral-400' : 'text-white/70',
                    ].join(' ')}>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                      {!incoming && (() => {
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
              <div className="text-sm text-neutral-500 text-center py-12">
                No messages yet. When this customer writes on WhatsApp, the thread shows up here.
              </div>
            )}
            {!selected && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-400">
                <BotMessageSquare className="w-10 h-10 opacity-30" />
                <p className="text-sm">Choose a chat from the inbox</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose bar */}
          <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!selected || loadingSend || sessionExpired}
                onClick={() => setShowCatalog((v) => !v)}
                className={[
                  'self-end rounded-xl border px-3 py-2 text-xs font-semibold shrink-0 transition-colors disabled:opacity-50',
                  showCatalog
                    ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                <Package className="w-3.5 h-3.5 inline mr-1" />
                Catalog
              </button>
              <textarea
                rows={2}
                className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm resize-none disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-colors"
                placeholder={
                  sessionExpired && selected
                    ? 'Session expired — use template below'
                    : selected
                      ? 'Type a message — sends via WhatsApp…'
                      : 'Select a chat first'
                }
                value={draft}
                disabled={!selected || sessionExpired}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
              />
              <Button
                variant="primary"
                size="sm"
                className="self-end shrink-0"
                disabled={loadingSend || !selected || sessionExpired || !draft.trim()}
                loading={loadingSend}
                iconLeft={!loadingSend ? <Send className="w-3.5 h-3.5" /> : undefined}
                onClick={send}
              >
                Send
              </Button>
            </div>

            {/* Template sends (session expired) */}
            {sessionExpired && selected && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                  Template send (wallet charged per message)
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 max-h-36 overflow-y-auto space-y-1">
                  {workingTemplates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      disabled={loadingSend}
                      onClick={() => sendTemplate(tmpl.id)}
                      className="w-full text-left rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                    >
                      {tmpl.name}
                    </button>
                  ))}
                  {!workingTemplates.length && (
                    <div className="text-xs text-neutral-500 px-2 py-2">
                      No working templates — create one under Communications.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Catalog picker */}
            {showCatalog && (
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 max-h-44 overflow-y-auto space-y-1.5">
                {catalogItems.map((item) => (
                  <button
                    key={`${item.name}-${item.imageUrl}`}
                    type="button"
                    onClick={() => sendFromCatalog(item)}
                    className="w-full text-left rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 flex items-center gap-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <img src={item.imageUrl} alt={item.name} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{item.description || item.imageUrl}</div>
                    </div>
                  </button>
                ))}
                {!catalogItems.length && (
                  <div className="text-xs text-neutral-500 px-2 py-2">
                    No catalog images found in Settings.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resume AI modal */}
      <Modal
        isOpen={showResumeAiModal}
        onClose={() => setShowResumeAiModal(false)}
        title="Resume AI"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowResumeAiModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={loadingAiControl} onClick={confirmResumeAi}>
              Resume AI
            </Button>
          </div>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">Choose when AI resumes:</p>
        <div className="space-y-3 text-sm">
          <label className="flex gap-3 cursor-pointer items-start">
            <input
              type="radio"
              name="resumeAiMode"
              checked={resumeAiMode === 'NEW_MESSAGES_ONLY'}
              onChange={() => setResumeAiMode('NEW_MESSAGES_ONLY')}
              className="mt-0.5 accent-brand-600"
            />
            <span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">New incoming messages only</span>
              <span className="block text-xs text-neutral-500 mt-0.5">
                Recommended — AI waits for the customer&apos;s next message before replying.
              </span>
            </span>
          </label>
          <label className="flex gap-3 cursor-pointer items-start">
            <input
              type="radio"
              name="resumeAiMode"
              checked={resumeAiMode === 'LAST_CUSTOMER_MESSAGE'}
              onChange={() => setResumeAiMode('LAST_CUSTOMER_MESSAGE')}
              className="mt-0.5 accent-brand-600"
            />
            <span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">Last customer message</span>
              <span className="block text-xs text-neutral-500 mt-0.5">
                AI replies immediately using the latest customer message (requires active WhatsApp session).
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
