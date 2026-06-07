import { X } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * FilterChip — a pill that shows an active filter value with a dismiss option.
 * Also exports a FilterChipGroup container.
 */
export function FilterChip({ label, value, onRemove, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300',
        'border border-brand-200 dark:border-brand-800',
        className
      )}
    >
      {label && (
        <span className="text-brand-500 dark:text-brand-500 font-normal">{label}:</span>
      )}
      {value}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-brand-900 transition-colors"
          aria-label={`Remove ${value} filter`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export function FilterChipGroup({ children, onClearAll, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {children}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export default FilterChip;
