export function detectIntent(text) {
  const t = (text || '').toLowerCase();
  if (/\bprice|cost|rate|kitna|charges\b/.test(t)) return 'PRICE_QUERY';
  if (/\bbook|appointment|slot|booking\b/.test(t)) return 'BOOKING';
  if (/\bpay|payment|upi|qr\b/.test(t)) return 'PAYMENT';
  return 'GENERAL';
}
