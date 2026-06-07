import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { Checkbox } from './Checkbox.jsx';
import { Skeleton } from './Skeleton.jsx';
import { EmptySearch } from './EmptyState.jsx';

/**
 * Table — sortable columns, row selection, loading skeletons, empty state, bulk actions.
 *
 * columns: [{key, label, sortable?, width?, className?, headerClassName?, align?, render?(row, i)}]
 * rows: array of objects
 *
 * Props:
 *   size       — 'sm' | 'md' (default) | 'lg'  — row density
 *   striped    — boolean — zebra-stripe even rows
 *   sticky     — boolean — sticky header (requires parent with overflow-auto + fixed height)
 *   stickyOffset — number — top offset for sticky header (default 0)
 */
export function Table({
  columns = [],
  rows = [],
  loading = false,
  skeletonRows = 5,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  getRowId = (row) => row.id,
  sortKey,
  sortDir = 'asc',
  onSort,
  emptyState,
  bulkActions,
  className,
  rowClassName,
  onRowClick,
  size = 'md',
  striped = false,
  sticky = false,
  stickyOffset = 0,
}) {
  const allIds = rows.map(getRowId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
  const someSelected = allIds.some((id) => selectedIds.includes(id)) && !allSelected;

  function toggleAll() {
    if (allSelected) onSelectionChange?.([]);
    else onSelectionChange?.([...new Set([...selectedIds, ...allIds])]);
  }

  function toggleRow(id) {
    if (selectedIds.includes(id)) onSelectionChange?.(selectedIds.filter((s) => s !== id));
    else onSelectionChange?.([...selectedIds, id]);
  }

  function handleSort(key) {
    if (!onSort) return;
    if (sortKey === key) {
      onSort(key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(key, 'asc');
    }
  }

  // Row cell padding by size
  const cellPad = size === 'sm' ? 'px-4 py-2' : size === 'lg' ? 'px-5 py-4' : 'px-4 py-3.5';
  const headPad = size === 'sm' ? 'px-4 py-2' : size === 'lg' ? 'px-5 py-3.5' : 'px-4 py-3';

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    if (sortKey !== col.key)
      return <ChevronsUpDown className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 flex-shrink-0" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
      : <ChevronDown className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />;
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* ── Bulk actions bar ── */}
      {selectable && selectedIds.length > 0 && bulkActions && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-50 dark:bg-brand-950/50 border-b border-brand-200 dark:border-brand-800">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 dark:bg-brand-900 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            {selectedIds.length} selected
          </span>
          <div className="flex items-center gap-2">{bulkActions}</div>
        </div>
      )}

      {/* ── Table scroll wrapper ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* ── Header ── */}
          <thead>
            <tr
              className={cn(
                'bg-neutral-50 dark:bg-neutral-800/60',
                'border-b-2 border-neutral-200 dark:border-neutral-700',
                sticky && `sticky top-[${stickyOffset}px] z-10`
              )}
            >
              {selectable && (
                <th className={cn('w-10', headPad)}>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => {
                const isActive = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={cn(
                      headPad,
                      'text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.sortable && 'cursor-pointer select-none hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors',
                      isActive && 'text-brand-600 dark:text-brand-400',
                      col.headerClassName
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className={cn(
                      'inline-flex items-center gap-1',
                      col.align === 'right' && 'flex-row-reverse'
                    )}>
                      {col.label}
                      <SortIcon col={col} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {loading ? (
              /* Loading skeletons */
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800/60">
                  {selectable && (
                    <td className={cellPad}>
                      <Skeleton className="w-4 h-4 rounded" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cellPad}>
                      <Skeleton
                        className={cn('h-4 rounded', col.width ? '' : 'w-full')}
                        style={{ width: col.skeletonWidth || (col.width ? '70%' : '80%') }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              /* Empty state */
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="py-3"
                >
                  {emptyState || <EmptySearch />}
                </td>
              </tr>
            ) : (
              /* Data rows */
              rows.map((row, i) => {
                const id = getRowId(row);
                const selected = selectedIds.includes(id);
                const isEven = i % 2 === 1;

                return (
                  <tr
                    key={id ?? i}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'group',
                      'border-b border-neutral-100 dark:border-neutral-800/60',
                      'transition-colors duration-[100ms]',
                      // Base color
                      striped && isEven
                        ? 'bg-neutral-50/50 dark:bg-neutral-800/20'
                        : 'bg-white dark:bg-neutral-900',
                      // Hover
                      selected
                        ? 'bg-brand-50/80 dark:bg-brand-950/30 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                      // Clickable cursor
                      onRowClick && 'cursor-pointer',
                      // Custom row class
                      typeof rowClassName === 'function' ? rowClassName(row) : rowClassName
                    )}
                  >
                    {selectable && (
                      <td
                        className={cn('w-10', cellPad)}
                        onClick={(e) => { e.stopPropagation(); toggleRow(id); }}
                      >
                        <Checkbox checked={selected} onChange={() => toggleRow(id)} />
                      </td>
                    )}
                    {columns.map((col, ci) => {
                      const isLastNoLabel = ci === columns.length - 1 && !col.label;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            cellPad,
                            'text-neutral-700 dark:text-neutral-300',
                            col.align === 'right' && 'text-right',
                            col.align === 'center' && 'text-center',
                            isLastNoLabel && 'text-right',
                            col.className
                          )}
                        >
                          {col.render
                            ? col.render(row, i)
                            : row[col.key] ?? (
                              <span className="text-neutral-300 dark:text-neutral-600 select-none">—</span>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;
