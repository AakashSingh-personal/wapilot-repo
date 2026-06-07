import { cn } from '../../utils/cn.js';
import { appointmentStatusColors, paymentStatusColors } from '../../design-system/tokens.js';

/**
 * Badge — color variants + dot indicator
 * Variants: default | brand | success | warning | error | info | purple | orange | pink
 */
const variantClasses = {
  default: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  brand:   'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  success: 'bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-400',
  warning: 'bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400',
  error:   'bg-error-50 text-error-700 dark:bg-error-950/40 dark:text-error-400',
  info:    'bg-info-50 text-info-700 dark:bg-info-950/40 dark:text-info-400',
  purple:  'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  orange:  'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  pink:    'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
};

const dotColors = {
  default: 'bg-neutral-400',
  brand:   'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error:   'bg-error-500',
  info:    'bg-info-500',
  purple:  'bg-purple-500',
  orange:  'bg-orange-500',
  pink:    'bg-pink-500',
};

const sizeClasses = {
  sm: 'text-2xs px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
  lg: 'text-xs px-2.5 py-1 gap-1.5',
};

export function Badge({ variant = 'default', size = 'md', dot = false, children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full whitespace-nowrap',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}

/* ─── Pre-built appointment status badge ─────────────────────────────── */
const apptStatusMap = {
  PENDING:     { variant: 'warning', label: 'Pending' },
  CONFIRMED:   { variant: 'info',    label: 'Confirmed' },
  CHECKED_IN:  { variant: 'brand',   label: 'Checked In' },
  IN_PROGRESS: { variant: 'purple',  label: 'In Progress' },
  COMPLETED:   { variant: 'success', label: 'Completed' },
  RESCHEDULED: { variant: 'info',    label: 'Rescheduled' },
  CANCELLED:   { variant: 'error',   label: 'Cancelled' },
  NO_SHOW:     { variant: 'default', label: 'No Show' },
};

export function AppointmentStatusBadge({ status, size = 'md', className }) {
  const { variant, label } = apptStatusMap[status] || { variant: 'default', label: status };
  return (
    <Badge variant={variant} size={size} dot className={className}>
      {label}
    </Badge>
  );
}

/* ─── Payment status badge ───────────────────────────────────────────── */
const payStatusMap = {
  PENDING:  { variant: 'warning', label: 'Pending' },
  PAID:     { variant: 'success', label: 'Paid' },
  FAILED:   { variant: 'error',   label: 'Failed' },
  REFUNDED: { variant: 'purple',  label: 'Refunded' },
  PARTIAL:  { variant: 'orange',  label: 'Partial' },
};

export function ApptPaymentStatusBadge({ status, size = 'md', className }) {
  const { variant, label } = payStatusMap[status] || { variant: 'default', label: status };
  return (
    <Badge variant={variant} size={size} dot className={className}>
      {label}
    </Badge>
  );
}

export default Badge;
