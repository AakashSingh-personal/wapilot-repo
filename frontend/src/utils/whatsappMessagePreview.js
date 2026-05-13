const MESSAGE_PREFIX = 'WA_MSG:';
const LEGACY_MEDIA_PREFIX = 'WA_MEDIA:';

export function parseMessageContent(rawContent) {
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

export function previewText(content, max = 72) {
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
