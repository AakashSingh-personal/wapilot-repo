import { forwardRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Checkbox = forwardRef(function Checkbox(
  { label, indeterminate = false, disabled, error, className, id, ...props },
  ref
) {
  const checkId = id || (label ? `cb-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <label
      htmlFor={checkId}
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="relative w-4 h-4 shrink-0">
        <input
          ref={ref}
          id={checkId}
          type="checkbox"
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div
          className={cn(
            'w-4 h-4 rounded border-2 transition-colors duration-[150ms]',
            'flex items-center justify-center',
            'border-neutral-300 dark:border-neutral-600',
            'peer-checked:bg-brand-600 peer-checked:border-brand-600',
            'dark:peer-checked:bg-brand-500 dark:peer-checked:border-brand-500',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1',
            error && 'border-error-500',
            indeterminate && 'bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500'
          )}
        >
          {indeterminate ? (
            <Minus className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          ) : (
            <Check className="w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
          )}
        </div>
      </div>
      {label && (
        <span className="text-sm text-neutral-700 dark:text-neutral-300">
          {label}
        </span>
      )}
    </label>
  );
});

export default Checkbox;
