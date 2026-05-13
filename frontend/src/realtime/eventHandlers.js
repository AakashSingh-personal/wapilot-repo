const THREAD_DEBOUNCE_MS = 280;

/**
 * @param {{
 *   loadThreads: () => void | Promise<void>,
 *   loadMessages: (customerId: string) => void | Promise<void>,
 *   getSelectedCustomerId: () => string | null,
 *   hasActiveConversationFilters?: () => boolean,
 *   applyWsInboxRow?: (row: Record<string, unknown>) => void,
 *   applyWsMessage?: (msg: Record<string, unknown>, customerId: string) => void,
 *   onAgentTyping?: (evt: Record<string, unknown>) => void,
 *   onAgentViewing?: (evt: Record<string, unknown>) => void,
 *   onAuthError?: (evt: Record<string, unknown>) => void,
 * }} ctx
 */
export function createInboxEventHandler(ctx) {
  let threadTimer = null;

  const scheduleThreads = () => {
    clearTimeout(threadTimer);
    threadTimer = setTimeout(() => {
      threadTimer = null;
      void ctx.loadThreads?.();
    }, THREAD_DEBOUNCE_MS);
  };

  const refreshOpenChatIfRelevant = (evt) => {
    const selected = ctx.getSelectedCustomerId?.() ?? null;
    const cid = (evt.customerId || evt.conversationId || null)?.toString?.() ?? null;
    if (!selected) return;
    if (!cid || cid === selected) {
      void ctx.loadMessages?.(selected);
    }
  };

  return (evt) => {
    if (!evt || typeof evt.type !== 'string') return;

    if (evt.type === 'auth_ok') return;

    if (evt.type === 'auth_error') {
      ctx.onAuthError?.(evt);
      return;
    }

    if (evt.type === 'agent_typing') {
      ctx.onAgentTyping?.(evt);
      return;
    }
    if (evt.type === 'agent_viewing') {
      ctx.onAgentViewing?.(evt);
      return;
    }

    const filtered =
      typeof ctx.hasActiveConversationFilters === 'function' &&
      ctx.hasActiveConversationFilters();

    if (filtered) {
      scheduleThreads();
      refreshOpenChatIfRelevant(evt);
      return;
    }

    if (evt.inboxRow && ctx.applyWsInboxRow) {
      ctx.applyWsInboxRow(evt.inboxRow);
    } else {
      scheduleThreads();
    }

    const cid = (evt.customerId || evt.conversationId || null)?.toString?.() ?? null;
    const selected = ctx.getSelectedCustomerId?.() ?? null;
    if (selected && cid === selected) {
      if (Array.isArray(evt.messages) && evt.messages.length) {
        for (const m of evt.messages) {
          ctx.applyWsMessage?.(m, cid);
        }
      } else if (evt.message) {
        ctx.applyWsMessage?.(evt.message, cid);
      }
    }
  };
}

/**
 * @param {{
 *   activeTab: string,
 *   loadContactBook: () => void | Promise<void>,
 * }} ctx
 */
export function createContactsEventHandler(ctx) {
  return (evt) => {
    if (!evt || evt.type !== 'contacts_changed') return;
    if (ctx.activeTab === 'CONTACT_BOOK') {
      void ctx.loadContactBook?.();
    }
  };
}
