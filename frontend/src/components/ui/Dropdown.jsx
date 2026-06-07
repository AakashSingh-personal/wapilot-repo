import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * Dropdown — button-triggered menu with optional search for long lists.
 *
 * items: [{label, value, icon?, divider?}]
 * onSelect(item)
 */
export function Dropdown({
  trigger,
  items = [],
  onSelect,
  align = 'left',  // 'left' | 'right'
  width = 'auto',  // 'auto' | 'sm' | 'md' | 'lg' | 'trigger'
  searchable = false,
  searchPlaceholder = 'Search…',
  className,
  menuClassName,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = searchable && search.trim()
    ? items.filter((item) =>
        item.label?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (!open) return;
    if (searchable) setTimeout(() => searchRef.current?.focus(), 50);
    const handleClick = (e) => {
      if (!containerRef.current?.contains(e.target)) close();
    };
    const handleKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close, searchable]);

  const widthCls = {
    auto:    'min-w-[10rem]',
    sm:      'w-40',
    md:      'w-52',
    lg:      'w-64',
    trigger: 'w-full',
  }[width] || 'min-w-[10rem]';

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      {/* Trigger */}
      <div onClick={() => setOpen((o) => !o)}>
        {trigger}
      </div>

      {/* Menu */}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 py-1',
            'bg-white dark:bg-neutral-900',
            'border border-neutral-200 dark:border-neutral-700',
            'rounded-xl shadow-lg shadow-neutral-900/10',
            'animate-slide-in-top',
            align === 'right' ? 'right-0' : 'left-0',
            'top-full',
            widthCls,
            menuClassName
          )}
          role="menu"
        >
          {searchable && (
            <div className="px-2 pb-1 border-b border-neutral-100 dark:border-neutral-800">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full text-xs pl-7 pr-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500 text-neutral-900 dark:text-neutral-50 placeholder-neutral-400"
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-3">No options found</p>
            ) : (
              filtered.map((item, i) => {
                if (item.divider) {
                  return <hr key={i} className="my-1 border-neutral-100 dark:border-neutral-800" />;
                }
                return (
                  <button
                    key={item.value ?? i}
                    role="menuitem"
                    onClick={() => { onSelect?.(item); close(); }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left',
                      'text-neutral-700 dark:text-neutral-200',
                      'hover:bg-neutral-50 dark:hover:bg-neutral-800',
                      'transition-colors duration-[100ms]',
                      item.active && 'text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/30',
                      item.danger && 'text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30',
                      item.disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
                    )}
                  >
                    {item.icon && <span className="shrink-0 w-4 h-4">{item.icon}</span>}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.active && <Check className="w-3.5 h-3.5 shrink-0" />}
                    {item.badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dropdown;
