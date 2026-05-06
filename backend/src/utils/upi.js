/**
 * Build a UPI deep link (Indian standard).
 * @param {{ pa: string, pn: string, am?: string, cu?: string }} p
 */
export function buildUpiLink({ pa, pn, am, cu = 'INR' }) {
  if (!pa || !pn) throw new Error('UPI payee address (pa) and name (pn) are required');
  const params = new URLSearchParams({
    pa: pa.trim(),
    pn: pn.trim(),
    cu,
  });
  if (am != null && am !== '') params.set('am', String(am));
  return `upi://pay?${params.toString()}`;
}
