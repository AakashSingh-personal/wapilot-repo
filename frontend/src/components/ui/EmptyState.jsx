import { cn } from '../../utils/cn.js';
import { Button } from './Button.jsx';

/**
 * EmptyState — flexible empty/zero-state component.
 * Also exports pre-built instances for all main pages.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  size = 'md',
  className,
}) {
  const sizes = {
    sm: { icon: 'w-8 h-8', iconWrap: 'w-12 h-12 rounded-xl', title: 'text-sm', desc: 'text-xs' },
    md: { icon: 'w-10 h-10', iconWrap: 'w-16 h-16 rounded-2xl', title: 'text-base', desc: 'text-sm' },
    lg: { icon: 'w-12 h-12', iconWrap: 'w-20 h-20 rounded-3xl', title: 'text-lg', desc: 'text-sm' },
  }[size];

  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {Icon && (
        <div
          className={cn(
            'flex items-center justify-center mb-4',
            'bg-neutral-100 dark:bg-neutral-800',
            sizes.iconWrap
          )}
        >
          <Icon className={cn('text-neutral-400 dark:text-neutral-500', sizes.icon)} strokeWidth={1.5} />
        </div>
      )}
      {title && (
        <h3 className={cn('font-semibold text-neutral-900 dark:text-neutral-100 mb-1', sizes.title)}>
          {title}
        </h3>
      )}
      {description && (
        <p className={cn('text-neutral-500 dark:text-neutral-500 max-w-sm', sizes.desc)}>
          {description}
        </p>
      )}
      {(action || (actionLabel && onAction)) && (
        <div className="mt-5">
          {action || (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Pre-built empty state instances ─────────────────────────────────── */
import {
  MessageSquare, Users, Calendar, CreditCard, Send, Search, Inbox,
  BellOff, Package, FileText, WifiOff,
} from 'lucide-react';

export const EmptyConversations = (props) => (
  <EmptyState
    icon={MessageSquare}
    title="No conversations yet"
    description="WhatsApp messages from your customers will appear here."
    {...props}
  />
);

export const EmptyCustomers = (props) => (
  <EmptyState
    icon={Users}
    title="No customers found"
    description="Add your first customer or import from a CSV to get started."
    {...props}
  />
);

export const EmptyAppointments = (props) => (
  <EmptyState
    icon={Calendar}
    title="No appointments"
    description="Appointments booked through your scheduling page will appear here."
    {...props}
  />
);

export const EmptyPayments = (props) => (
  <EmptyState
    icon={CreditCard}
    title="No payment records"
    description="Payment requests and transactions will appear here."
    {...props}
  />
);

export const EmptyCampaigns = (props) => (
  <EmptyState
    icon={Send}
    title="No campaigns yet"
    description="Create your first WhatsApp campaign to engage customers at scale."
    {...props}
  />
);

export const EmptySearch = (props) => (
  <EmptyState
    icon={Search}
    title="No results found"
    description="Try adjusting your search or filter to find what you're looking for."
    size="sm"
    {...props}
  />
);

export const EmptyInbox = (props) => (
  <EmptyState
    icon={Inbox}
    title="All caught up"
    description="No new messages. Check back later."
    size="sm"
    {...props}
  />
);

export const EmptyNotifications = (props) => (
  <EmptyState
    icon={BellOff}
    title="No notifications"
    description="You're all up to date."
    size="sm"
    {...props}
  />
);

export const EmptyOffline = (props) => (
  <EmptyState
    icon={WifiOff}
    title="You're offline"
    description="Check your internet connection and try again."
    {...props}
  />
);

export default EmptyState;
