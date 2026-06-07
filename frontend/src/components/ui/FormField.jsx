import { cn } from '../../utils/cn.js';

/**
 * FormField — label + control + error/helper wrapper.
 * Wraps any form control (Input, Select, etc.) with consistent label/error layout.
 */
export function FormField({
  label,
  htmlFor,
  error,
  helper,
  required,
  className,
  children,
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {label}
          {required && <span className="text-error-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-error-600 dark:text-error-400">{error}</p>
      )}
      {helper && !error && (
        <p className="text-xs text-neutral-500">{helper}</p>
      )}
    </div>
  );
}

export default FormField;
