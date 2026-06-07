import { cn } from '../../utils/cn.js';

/**
 * Tabs — line and pill variants.
 * Usage:
 *   <Tabs value={tab} onChange={setTab} items={[{value:'a', label:'A'}, ...]} />
 *   <Tabs variant="pill" ... />
 */
export function Tabs({
  variant = 'line',
  value,
  onChange,
  items = [],
  className,
  tabClassName,
}) {
  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg',
          className
        )}
        role="tablist"
      >
        {items.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={value === item.value}
            onClick={() => onChange?.(item.value)}
            disabled={item.disabled}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-[150ms]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
              value === item.value
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50 shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200',
              item.disabled && 'opacity-50 cursor-not-allowed',
              tabClassName
            )}
          >
            {item.icon && <span className="mr-1.5">{item.icon}</span>}
            {item.label}
            {item.count != null && (
              <span className={cn(
                'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                value === item.value
                  ? 'bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
              )}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // line variant
  return (
    <div
      className={cn('flex border-b border-neutral-200 dark:border-neutral-800', className)}
      role="tablist"
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange?.(item.value)}
          disabled={item.disabled}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium -mb-px',
            'border-b-2 transition-all duration-[150ms]',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2',
            value === item.value
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:border-neutral-300',
            item.disabled && 'opacity-50 cursor-not-allowed',
            tabClassName
          )}
        >
          {item.icon}
          {item.label}
          {item.count != null && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              value === item.value
                ? 'bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
            )}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
