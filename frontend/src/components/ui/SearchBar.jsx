import { Search, X } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = 'Search…',
  className,
  size = 'md',
  ...props
}) {
  const heights = { sm: 'h-8', md: 'h-9', lg: 'h-10' };
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-sm' };

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className="absolute left-3 w-4 h-4 text-neutral-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-lg border border-neutral-300 dark:border-neutral-700',
          'bg-white dark:bg-neutral-900',
          'text-neutral-900 dark:text-neutral-50',
          'placeholder-neutral-400 dark:placeholder-neutral-600',
          'pl-9 pr-8 transition-colors duration-[150ms]',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500',
          heights[size],
          textSizes[size]
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange?.(''); onClear?.(); }}
          className="absolute right-2.5 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
