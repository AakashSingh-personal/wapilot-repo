import crypto from 'crypto';
import Razorpay from 'razorpay';

let cachedClient = null;

export function getRazorpayClient() {
  if (cachedClient) return cachedClient;
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret) {
    throw new Error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
  }
  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cachedClient;
}

export function razorpayPublicConfig() {
  return { keyId: process.env.RAZORPAY_KEY_ID || '' };
}

export async function createRazorpayOrder({ amountInInr, receipt, notes = {} }) {
  const client = getRazorpayClient();
  const amountPaise = Math.round(Number(amountInInr) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Invalid order amount');
  }
  return client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes,
  });
}

export async function fetchRazorpayOrder(orderId) {
  if (!orderId) throw new Error('orderId required');
  const client = getRazorpayClient();
  return client.orders.fetch(orderId);
}

export async function createRazorpayPaymentLink({
  amountInInr,
  customer = {},
  notes = {},
  description = 'Customer payment request',
}) {
  const client = getRazorpayClient();
  const amountPaise = Math.round(Number(amountInInr) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Invalid payment link amount');
  }
  return client.paymentLink.create({
    amount: amountPaise,
    currency: 'INR',
    description,
    customer,
    notify: {
      sms: Boolean(customer?.contact),
      email: Boolean(customer?.email),
    },
    reminder_enable: true,
    notes,
  });
}

export function verifyRazorpayPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!secret) throw new Error('Missing RAZORPAY_KEY_SECRET');
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

export function verifyRazorpayWebhookSignature({ rawBody, signature }) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!secret) throw new Error('Missing RAZORPAY_WEBHOOK_SECRET');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
}
