import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * Pagination — page-based with prev/next and page number buttons.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
  showInfo = true,
  total,
  pageSize,
}) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const pages = getPages();
  const btnBase =
    'h-8 min-w-[32px] px-2 text-sm font-medium rounded-lg transition-colors duration-[150ms] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {showInfo && total != null && pageSize != null && (
        <p className="text-sm text-neutral-500 dark:text-neutral-500 shrink-0">
          Showing{' '}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)}
          </span>{' '}
          of{' '}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{total}</span>
        </p>
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={cn(
            btnBase,
            'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-sm text-neutral-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={page === p ? 'page' : undefined}
              className={cn(
                btnBase,
                page === p
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={cn(
            btnBase,
            'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
