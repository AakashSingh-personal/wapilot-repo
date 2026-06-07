import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Select = forwardRef(function Select(
  { label, error, helper, containerClassName, className, id, required, disabled, children, placeholder, ...props },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          className={cn(
            'block w-full rounded-lg border text-sm px-3 py-2 pr-9 h-9 appearance-none',
            'bg-white dark:bg-neutral-900',
            'text-neutral-900 dark:text-neutral-50',
            'transition-colors duration-[150ms] ease-out',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500',
            error
              ? 'border-error-500 focus:ring-error-500/25'
              : 'border-neutral-300 dark:border-neutral-700',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
        />
      </div>
      {error && <p className="text-xs text-error-600 dark:text-error-400">{error}</p>}
      {helper && !error && <p className="text-xs text-neutral-500">{helper}</p>}
    </div>
  );
});

export default Select;
