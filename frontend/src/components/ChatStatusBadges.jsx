function sessionBadgeClass(status) {
  if (status === 'active') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200';
  }
  if (status === 'expiring') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  }
  if (status === 'expired') {
    return 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function messageBadgeClass(status) {
  if (status === 'sent') return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  if (status === 'unread') return 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100';
  if (status === 'read') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200';
  if (status === 'replied') return 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export function SessionBadge({ status }) {
  const label = { active: 'Active', expiring: 'Expiring', expired: 'Expired' };
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sessionBadgeClass(status)}`}
    >
      {label[status] || status}
    </span>
  );
}

export function MessageBadge({ status }) {
  const label = { sent: 'Sent', unread: 'Unread', read: 'Read', replied: 'Replied' };
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${messageBadgeClass(status)}`}
    >
      {label[status] || status}
    </span>
  );
}
