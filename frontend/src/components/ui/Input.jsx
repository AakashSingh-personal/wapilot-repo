import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

/**
 * Input — text, email, password, number, search, tel, url
 * Supports prefix icon, suffix icon, error state, helper text
 */
export const Input = forwardRef(function Input(
  {
    label,
    error,
    helper,
    prefix,      // element shown before input (icon or text)
    suffix,      // element shown after input (icon or button)
    containerClassName,
    className,
    id,
    required,
    disabled,
    type = 'text',
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <div className="absolute left-3 flex items-center text-neutral-400 dark:text-neutral-500 pointer-events-none">
            {prefix}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          required={required}
          className={cn(
            'block w-full rounded-lg border text-sm',
            'bg-white dark:bg-neutral-900',
            'text-neutral-900 dark:text-neutral-50',
            'placeholder-neutral-400 dark:placeholder-neutral-600',
            'transition-colors duration-[150ms] ease-out',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500',
            error
              ? 'border-error-500 focus:ring-error-500/25 focus:border-error-500'
              : 'border-neutral-300 dark:border-neutral-700',
            disabled && 'opacity-50 cursor-not-allowed bg-neutral-50 dark:bg-neutral-800',
            prefix ? 'pl-9' : 'pl-3',
            suffix ? 'pr-9' : 'pr-3',
            'py-2 h-9',
            className
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute right-3 flex items-center text-neutral-400 dark:text-neutral-500">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-error-600 dark:text-error-400">{error}</p>
      )}
      {helper && !error && (
        <p className="text-xs text-neutral-500 dark:text-neutral-500">{helper}</p>
      )}
    </div>
  );
});

export default Input;
