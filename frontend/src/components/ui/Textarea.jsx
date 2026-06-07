import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

export const Textarea = forwardRef(function Textarea(
  { label, error, helper, containerClassName, className, id, required, disabled, rows = 3, ...props },
  ref
) {
  const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        disabled={disabled}
        required={required}
        className={cn(
          'block w-full rounded-lg border text-sm px-3 py-2',
          'bg-white dark:bg-neutral-900',
          'text-neutral-900 dark:text-neutral-50',
          'placeholder-neutral-400 dark:placeholder-neutral-600',
          'resize-y min-h-[72px]',
          'transition-colors duration-[150ms] ease-out',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500',
          error
            ? 'border-error-500 focus:ring-error-500/25'
            : 'border-neutral-300 dark:border-neutral-700',
          disabled && 'opacity-50 cursor-not-allowed bg-neutral-50 dark:bg-neutral-800',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-error-600 dark:text-error-400">{error}</p>}
      {helper && !error && <p className="text-xs text-neutral-500">{helper}</p>}
    </div>
  );
});

export default Textarea;
