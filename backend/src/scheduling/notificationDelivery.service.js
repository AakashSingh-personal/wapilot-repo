import axios from 'axios';
import nodemailer from 'nodemailer';
import { log } from '../utils/logger.js';

let smtpTransport;

function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  smtpTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  return smtpTransport;
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export function isSmsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

export function configuredReminderChannels() {
  const raw = process.env.REMINDER_CHANNELS || 'WHATSAPP';
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export async function sendEmail({ to, subject, text }) {
  const transport = getSmtpTransport();
  const from = process.env.SMTP_FROM;
  if (!transport || !from) throw new Error('SMTP not configured');
  if (!to) throw new Error('No email recipient');

  await transport.sendMail({ from, to, subject, text });
}

export async function sendSms({ toPhoneE164, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error('Twilio not configured');
  if (!toPhoneE164) throw new Error('No SMS recipient');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  await axios.post(
    url,
    new URLSearchParams({ To: toPhoneE164, From: from, Body: body }),
    {
      auth: { username: sid, password: token },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
}

export async function deliverReminder({ channel, toEmail, toPhoneE164, subject, body }) {
  if (channel === 'EMAIL') {
    await sendEmail({ to: toEmail, subject, text: body });
    return;
  }
  if (channel === 'SMS') {
    await sendSms({ toPhoneE164, body });
    return;
  }
  log('warn', 'unknown_reminder_channel', { channel });
}
