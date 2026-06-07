import { useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/* ─── Toast variant config ─────────────────────────────────────────────── */
const variantConfig = {
  success: {
    icon: CheckCircle2,
    iconCls: 'text-success-500',
    borderCls: 'border-l-success-500',
    bgCls: 'bg-white dark:bg-neutral-900',
  },
  warning: {
    icon: AlertTriangle,
    iconCls: 'text-warning-500',
    borderCls: 'border-l-warning-500',
    bgCls: 'bg-white dark:bg-neutral-900',
  },
  error: {
    icon: XCircle,
    iconCls: 'text-error-500',
    borderCls: 'border-l-error-500',
    bgCls: 'bg-white dark:bg-neutral-900',
  },
  info: {
    icon: Info,
    iconCls: 'text-info-500',
    borderCls: 'border-l-info-500',
    bgCls: 'bg-white dark:bg-neutral-900',
  },
};

/* ─── Single Toast item ─────────────────────────────────────────────────── */
function ToastItem({ id, variant = 'info', title, message, onDismiss, duration = 4000 }) {
  const { icon: Icon, iconCls, borderCls, bgCls } = variantConfig[variant] || variantConfig.info;
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 200);
  }, [id, onDismiss]);

  useEffect(() => {
    if (duration > 0) {
      timerRef.current = setTimeout(dismiss, duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [dismiss, duration]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 w-80 p-4 rounded-xl',
        'border border-neutral-200 dark:border-neutral-700 border-l-4',
        'shadow-lg shadow-neutral-900/10',
        bgCls,
        borderCls,
        exiting ? 'animate-slide-out-right opacity-0' : 'animate-slide-in-bottom',
        'transition-opacity duration-200'
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconCls)} />
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 leading-snug">
            {title}
          </p>
        )}
        {message && (
          <p className={cn('text-sm text-neutral-600 dark:text-neutral-400', title && 'mt-0.5')}>
            {message}
          </p>
        )}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 mt-0.5 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Toast container ───────────────────────────────────────────────────── */
export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

/* ─── useToast hook ─────────────────────────────────────────────────────── */
let _setToasts = null;
let _idCounter = 0;

export function useToast() {
  return {
    toast(opts) {
      const id = ++_idCounter;
      const item = typeof opts === 'string'
        ? { id, variant: 'info', message: opts }
        : { id, ...opts };
      _setToasts?.((prev) => [...prev, item]);
      return id;
    },
    success(message, title) {
      return this.toast({ variant: 'success', message, title });
    },
    error(message, title) {
      return this.toast({ variant: 'error', message, title });
    },
    warning(message, title) {
      return this.toast({ variant: 'warning', message, title });
    },
    info(message, title) {
      return this.toast({ variant: 'info', message, title });
    },
    dismiss(id) {
      _setToasts?.((prev) => prev.filter((t) => t.id !== id));
    },
  };
}

/* ─── ToastProvider — mount once at app root ────────────────────────────── */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

export default useToast;
