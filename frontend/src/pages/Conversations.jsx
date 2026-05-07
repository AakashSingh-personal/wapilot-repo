import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';

const POLL_MS = 4000;
const MESSAGE_PREFIX = 'WA_MSG:';
const LEGACY_MEDIA_PREFIX = 'WA_MEDIA:';

function parseMessageContent(rawContent) {
  if (typeof rawContent !== 'string') {
    return { kind: 'text', text: '' };
  }
  if (rawContent.startsWith(LEGACY_MEDIA_PREFIX)) {
    try {
      const parsed = JSON.parse(rawContent.slice(LEGACY_MEDIA_PREFIX.length));
      if (parsed?.kind) return parsed;
    } catch {
      // Continue to other parsing paths.
    }
  }
  if (!rawContent.startsWith(MESSAGE_PREFIX)) {
    return { kind: 'text', text: rawContent };
  }
  try {
    const parsed = JSON.parse(rawContent.slice(MESSAGE_PREFIX.length));
    if (parsed?.kind) return parsed;
  } catch {
    // Fallback to plain text if older/bad payload is present.
  }
  return { kind: 'text', text: rawContent };
}

function previewText(content, max = 72) {
  const parsed = parseMessageContent(content);
  if (parsed.kind === 'image') {
    return parsed.caption ? `Image: ${parsed.caption}` : 'Image';
  }
  if (parsed.kind === 'audio') return 'Audio';
  if (parsed.kind === 'video') return parsed.caption ? `Video: ${parsed.caption}` : 'Video';
  if (parsed.kind === 'document') return parsed.filename ? `Document: ${parsed.filename}` : 'Document';
  if (parsed.kind === 'sticker') return 'Sticker';
  if (parsed.kind === 'location') return 'Location';
  if (parsed.kind === 'contacts') return 'Contact card';
  if (parsed.kind === 'button') return parsed.text ? `Button: ${parsed.text}` : 'Button reply';
  if (parsed.kind === 'interactive') return 'Interactive reply';
  if (parsed.kind === 'reaction') return parsed.emoji ? `Reaction: ${parsed.emoji}` : 'Reaction';
  if (typeof parsed.raw === 'string') {
    const oneLineRaw = parsed.raw.replace(/\s+/g, ' ').trim();
    return oneLineRaw.length <= max ? oneLineRaw : `${oneLineRaw.slice(0, max)}…`;
  }
  const oneLine = (parsed.text || '').replace(/\s+/g, ' ').trim();
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

function statusTick(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'read') return { text: '✓✓', cls: 'text-sky-500' };
  if (s === 'delivered') return { text: '✓✓', cls: 'text-slate-400' };
  if (s === 'sent') return { text: '✓', cls: 'text-slate-400' };
  if (s === 'pending') return { text: '⏳', cls: 'text-slate-400' };
  return null;
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
      await loadMessages(selectedId);
      await loadThreads();
    } catch (e) {
      setError(e.response?.data?.error || 'Send failed — check WhatsApp token / phone number id');
    } finally {
      setLoadingSend(false);
    }
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
      await loadMessages(selectedId);
      await loadThreads();
    } catch (e) {
      setError(e.response?.data?.error || 'Catalog send failed');
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
                        'text-[10px] mt-1 opacity-70 flex items-center gap-1',
                        incoming ? 'text-slate-400' : 'text-white/70',
                      ].join(' ')}
                    >
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                      {(() => {
                        if (incoming) return null;
                        const parsed = parseMessageContent(m.content);
                        const marker = statusTick(parsed.status);
                        if (!marker) return null;
                        return <span className={marker.cls}>{marker.text}</span>;
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
              disabled={!selected || loadingSend}
              onClick={() => setShowCatalog((v) => !v)}
              className="self-end rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold disabled:opacity-50 shrink-0"
            >
              Send from catalog
            </button>
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
        </div>
      </div>
    </div>
  );
}
