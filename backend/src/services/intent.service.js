export function detectIntent(text) {
  const t = (text || '').toLowerCase();
  if (/\b(status|paid|payment status|txn|transaction)\b/.test(t) && /\bpay|payment|upi|qr\b/.test(t)) {
    return 'PAYMENT_STATUS';
  }
  if (/\bnext appointment|upcoming appointment\b/.test(t)) return 'NEXT_APPOINTMENT';
  if (/\blast appointment|previous appointment\b/.test(t)) return 'LAST_APPOINTMENT';
  if (/\breschedule|change slot|move appointment\b/.test(t)) return 'RESCHEDULE';
  if (/\bcancel appointment|cancel booking\b/.test(t)) return 'CANCEL_BOOKING';
  if (/\bwaitlist\b/.test(t)) return 'WAITLIST';
  if (/\bavailable|availability|free slot|open slot|any slot\b/.test(t)) return 'CHECK_AVAILABILITY';
  if (/\bprice|cost|rate|kitna|charges\b/.test(t)) return 'PRICE_QUERY';
  if (/\bbook|appointment|slot|booking|haircut|consultation\b/.test(t)) return 'BOOKING';
  if (/\bpay|payment|upi|qr\b/.test(t)) return 'PAYMENT';
  return 'GENERAL';
}
