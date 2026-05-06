import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';

const POLL_MS = 4000;

function previewText(content, max = 72) {
  const oneLine = (content || '').replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

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

function bubbleMeta(type) {
  if (type === 'USER') return { align: 'left', label: 'Customer', bubble: 'incoming' };
  if (type === 'STAFF') return { align: 'right', label: 'You (web)', bubble: 'staff' };
  return { align: 'right', label: 'Auto-reply', bubble: 'bot' };
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

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

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

  const loadThreads = useCallback(async () => {
    try {
      const { data } = await api.get('/dashboard/conversations');
      setThreads(data);
      setError('');
      return data;
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load inbox');
      return [];
    }
  }, []);

  const loadMessages = useCallback(async (customerId) => {
    if (!customerId) return;
    try {
      const { data } = await api.get(`/dashboard/messages/${customerId}`);
      setMessages(data);
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
    if (!selectedId) return;
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
      await loadMessages(selectedId);
      await loadThreads();
    } catch (e) {
      setError(e.response?.data?.error || 'Send failed — check WhatsApp token / phone number id');
    } finally {
      setLoadingSend(false);
    }
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

      <div className="grid md:grid-cols-5 gap-4 min-h-[min(720px,calc(100vh-12rem))]">
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
                  ].join(' ')}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="font-medium text-slate-900 dark:text-white truncate">
                      {t.name || 'Unknown'}
                    </div>
                    <div className="text-[11px] text-slate-400 shrink-0">
                      {formatShortTime(t.lastMessage?.createdAt)}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">{t.phone}</div>
                  {t.lastMessage && (
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {t.lastMessage.type === 'USER' ? '' : t.lastMessage.type === 'STAFF' ? 'You: ' : 'Bot: '}
                      {previewText(t.lastMessage.content)}
                    </div>
                  )}
                  {!t.lastMessage && (
                    <div className="text-xs text-slate-400 mt-1 italic">No messages yet</div>
                  )}
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

        <div className="md:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col min-h-[420px]">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 dark:text-white truncate">
                {selected?.name || 'Select a chat'}
              </div>
              <div className="text-xs text-slate-500 font-mono truncate">{selected?.phone}</div>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0 hidden sm:block">
              Live sync ~{POLL_MS / 1000}s
            </span>
          </div>
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
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    <div
                      className={[
                        'text-[10px] mt-1 opacity-70',
                        incoming ? 'text-slate-400' : 'text-white/70',
                      ].join(' ')}
                    >
                      {new Date(m.createdAt).toLocaleString()}
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
            <textarea
              rows={2}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm resize-none"
              placeholder={selected ? 'Type a message — sends on WhatsApp…' : 'Select a chat first'}
              value={draft}
              disabled={!selected}
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
              disabled={loadingSend || !selected}
              onClick={send}
              className="self-end rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              {loadingSend ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
