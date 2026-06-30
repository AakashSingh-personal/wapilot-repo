import { Link } from 'react-router-dom';
import {
  MessageSquare, Calendar, Users, Zap, BarChart2, Bell,
  CheckCircle, ArrowRight, Bot, CreditCard, Globe, Shield,
  Star, ChevronRight,
} from 'lucide-react';

// ── Feature data ──────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Live WhatsApp Inbox',
    desc: 'Manage all customer conversations in a unified inbox. Assign chats, track read status, and never miss a message.',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
  },
  {
    icon: Zap,
    title: 'Template Campaigns',
    desc: 'Send approved WhatsApp templates to thousands of contacts in one click. Full delivery tracking per recipient.',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
  },
  {
    icon: Calendar,
    title: 'Appointment Scheduling',
    desc: 'Online booking pages, staff calendars, slot management, automated reminders — the full scheduling stack.',
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-950/40',
  },
  {
    icon: Bot,
    title: 'AI Booking Assistant',
    desc: 'Customers book appointments by chatting on WhatsApp. The AI handles availability, confirmations, and reschedules.',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
  },
  {
    icon: Users,
    title: 'Customer Management',
    desc: 'Unified customer profiles with chat history, appointment records, and custom fields — all in one place.',
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
  },
  {
    icon: CreditCard,
    title: 'Communication Wallet',
    desc: 'Pre-paid wallet for WhatsApp messaging costs. Transparent ₹2/contact pricing with real-time balance tracking.',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Connect your WhatsApp',
    desc: 'Link your WhatsApp Business number via Meta API. Takes under 5 minutes.',
  },
  {
    step: '02',
    title: 'Set up your workspace',
    desc: 'Add your team, create services, configure booking pages and message templates.',
  },
  {
    step: '03',
    title: 'Start engaging customers',
    desc: 'Reply to chats, run campaigns, take bookings — all from one dashboard.',
  },
];

const STATS = [
  { value: '2 min', label: 'Avg. first response time' },
  { value: '₹2', label: 'Per WhatsApp message sent' },
  { value: '24/7', label: 'AI handles bookings' },
  { value: '0', label: 'Setup fee' },
];

const TESTIMONIALS = [
  {
    name: 'Priya S.',
    role: 'Salon owner, Delhi',
    text: 'Our booking confirmations and reminders now go automatically on WhatsApp. We reduced no-shows by 60%.',
    rating: 5,
  },
  {
    name: 'Rahul M.',
    role: 'Clinic manager, Mumbai',
    text: 'The inbox makes it so easy to manage all patient queries. The AI books appointments even at midnight.',
    rating: 5,
  },
  {
    name: 'Ananya K.',
    role: 'Fitness studio, Bangalore',
    text: 'Bulk templates for promotions work seamlessly. The wallet system keeps costs totally predictable.',
    rating: 5,
  },
];

// ── Sub-components ────────────────────────────────────────────────────────
function StarRow({ count = 5 }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      ))}
    </span>
  );
}

export default function Home() {
  return (
    <div className="space-y-24 pb-12">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-700 text-white px-8 py-16 md:py-20 text-center">
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.15) 1px,transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative max-w-3xl mx-auto space-y-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3.5 py-1 text-xs font-semibold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            WhatsApp Business Automation
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
            Run your business<br className="hidden sm:block" /> on WhatsApp
          </h1>
          <p className="text-lg sm:text-xl text-white/85 max-w-2xl mx-auto leading-relaxed">
            Conversations, campaigns, bookings, and billing — one dashboard that turns WhatsApp into your most powerful business tool.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-700 px-6 py-3 text-sm font-bold shadow-lg hover:bg-neutral-50 transition-colors"
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              View pricing
            </Link>
          </div>
          <p className="text-white/60 text-xs pt-1">No credit card required · Setup in under 5 minutes</p>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      <section className="-mt-10">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-neutral-100 dark:divide-neutral-800 overflow-hidden">
          {STATS.map(({ value, label }) => (
            <div key={label} className="px-6 py-5 text-center">
              <div className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">{value}</div>
              <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Everything in one place</h2>
          <p className="text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto">
            From first message to paid appointment — Vartalap handles the entire customer journey over WhatsApp.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div
              key={title}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-3 hover:shadow-md transition-shadow"
            >
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="rounded-3xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 px-8 py-12 space-y-10">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Up and running in minutes</h2>
          <p className="text-neutral-500 dark:text-neutral-400">No complex setup. No hidden steps.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
            <div key={step} className="flex flex-col items-center text-center space-y-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center text-xl font-extrabold shadow-lg">
                  {step}
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ChevronRight className="hidden md:block absolute -right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-300 dark:text-neutral-600" />
                )}
              </div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scheduling spotlight ──────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-10 items-center">
        <div className="space-y-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-3 py-1 text-xs font-semibold">
            <Calendar className="w-3.5 h-3.5" /> Scheduling
          </span>
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 leading-tight">
            A full booking system, delivered over WhatsApp
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Customers book through a public link or by chatting with the AI. Staff get automatic reminders, you get zero no-shows.
          </p>
          <ul className="space-y-2.5">
            {[
              'Online booking page — shareable public link',
              'AI assistant books via WhatsApp chat',
              'Automated confirmations & reminders',
              'Waitlist management & rebooking campaigns',
              'Razorpay / UPI advance payment collection',
              'Staff profiles, reviews, and availability',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-neutral-700 dark:text-neutral-300">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            Talk to sales <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs text-neutral-400 font-mono">Public Booking Page</span>
          </div>
          {[
            { label: 'Service', value: 'Haircut + Beard Trim · 45 min' },
            { label: 'Location', value: 'Main Branch, Dwarka, Delhi' },
            { label: 'Staff', value: 'Rahul K. ⭐ 4.8' },
            { label: 'Slot', value: 'Tomorrow, 11:00 AM' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <span className="text-xs text-neutral-500">{label}</span>
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</span>
            </div>
          ))}
          <div className="pt-2">
            <div className="w-full rounded-xl bg-brand-600 text-white text-center py-2.5 text-sm font-semibold">
              Confirm booking
            </div>
          </div>
        </div>
      </section>

      {/* ── Campaigns spotlight ───────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-10 items-center">
        <div className="order-2 md:order-1 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs text-neutral-400 font-mono">Campaign Send</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Template', value: 'summer_offer_v2' },
              { label: 'Recipients', value: '1,240 contacts' },
              { label: 'Wallet balance', value: '₹3,800' },
              { label: 'Est. cost', value: '₹2,480' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <span className="text-xs text-neutral-500">{label}</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[
              { stat: '1,240', sub: 'Sent' },
              { stat: '1,198', sub: 'Delivered' },
              { stat: '312', sub: 'Replied' },
            ].map(({ stat, sub }) => (
              <div key={sub} className="rounded-xl bg-neutral-50 dark:bg-neutral-800 p-3 text-center">
                <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{stat}</div>
                <div className="text-[10px] text-neutral-500">{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="order-1 md:order-2 space-y-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-3 py-1 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5" /> Campaigns
          </span>
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 leading-tight">
            Reach every customer, instantly
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Send approved WhatsApp templates to your entire contact list or a filtered segment. Every send is tracked per recipient.
          </p>
          <ul className="space-y-2.5">
            {[
              'Bulk & single sends from one interface',
              'Per-contact delivery tracking',
              'Pre-flight wallet balance check',
              'Custom field personalization in templates',
              'Contact book with CSV import',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-neutral-700 dark:text-neutral-300">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Loved by businesses</h2>
          <p className="text-neutral-500 dark:text-neutral-400">From salons to clinics to fitness studios.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map(({ name, role, text, rating }) => (
            <div
              key={name}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3"
            >
              <StarRow count={rating} />
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">&ldquo;{text}&rdquo;</p>
              <div>
                <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{name}</div>
                <div className="text-xs text-neutral-500">{role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust badges ──────────────────────────────────────────────── */}
      <section className="grid sm:grid-cols-3 gap-4">
        {[
          {
            icon: Shield,
            title: 'Meta API certified',
            desc: 'Built on the official WhatsApp Business API. Your data never touches third-party servers.',
          },
          {
            icon: Globe,
            title: 'Public booking links',
            desc: 'Share a URL — customers book without installing any app. Works on any device.',
          },
          {
            icon: BarChart2,
            title: 'Real-time analytics',
            desc: 'Dashboard with appointment stats, message delivery rates, and revenue at a glance.',
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5"
          >
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <Icon className="w-4.5 h-4.5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{title}</div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────── */}
      <section className="rounded-3xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white px-8 py-14 text-center space-y-5">
        <Bell className="w-10 h-10 mx-auto opacity-80" />
        <h2 className="text-3xl font-bold">Ready to automate your business?</h2>
        <p className="text-white/80 max-w-lg mx-auto">
          Join businesses that have cut manual follow-ups, reduced no-shows, and grown revenue — all through WhatsApp.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-700 px-7 py-3 text-sm font-bold shadow hover:bg-neutral-50 transition-colors"
          >
            Contact sales <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-7 py-3 text-sm font-semibold hover:bg-white/20 transition-colors"
          >
            See pricing
          </Link>
        </div>
      </section>

    </div>
  );
}
