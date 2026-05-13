/** Standardized realtime event types (lightweight payloads; REST remains source of truth). */
export const EventType = {
  MESSAGE_CREATED: 'message_created',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_STATUS: 'message_status',
  CONVERSATION_UPDATED: 'conversation_updated',
  CONVERSATION_ASSIGNED: 'conversation_assigned',
  AI_CONTROL_CHANGED: 'ai_control_changed',
  SESSION_CHANGED: 'session_changed',
  UNREAD_CHANGED: 'unread_changed',
  AGENT_TYPING: 'agent_typing',
  AGENT_VIEWING: 'agent_viewing',
  CONTACTS_CHANGED: 'contacts_changed',
  PING: 'ping',
  PONG: 'pong',
  AUTH_OK: 'auth_ok',
  AUTH_ERROR: 'auth_error',
};
