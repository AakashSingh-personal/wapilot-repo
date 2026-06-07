import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { Checkbox } from './Checkbox.jsx';
import { Skeleton } from './Skeleton.jsx';
import { EmptySearch } from './EmptyState.jsx';

/**
 * Table — sortable columns, row selection, loading skeletons, empty state, bulk actions.
 *
 * columns: [{key, label, sortable?, width?, className?, render?(row, i)}]
 * rows: array of objects
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

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    if (sortKey !== col.key) return <ChevronsUpDown className="w-3.5 h-3.5 text-neutral-400" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-brand-500" />
      : <ChevronDown className="w-3.5 h-3.5 text-brand-500" />;
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Bulk actions bar */}
      {selectable && selectedIds.length > 0 && bulkActions && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-50 dark:bg-brand-950/40 border-b border-brand-100 dark:border-brand-900">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            {selectedIds.length} selected
          </span>
          {bulkActions}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 dark:border-neutral-800">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide whitespace-nowrap',
                    col.sortable && 'cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200',
                    col.className
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-50 dark:border-neutral-800/50">
                  {selectable && <td className="px-4 py-3"><Skeleton className="w-4 h-4 rounded" /></td>}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className={cn('h-4 rounded', col.width ? '' : 'w-full')} style={{ width: col.skeletonWidth || '80%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-2">
                  {emptyState || <EmptySearch />}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const id = getRowId(row);
                const selected = selectedIds.includes(id);
                return (
                  <tr
                    key={id ?? i}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'border-b border-neutral-50 dark:border-neutral-800/50',
                      'transition-colors duration-[100ms]',
                      'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                      selected && 'bg-brand-50/60 dark:bg-brand-950/20',
                      onRowClick && 'cursor-pointer',
                      typeof rowClassName === 'function' ? rowClassName(row) : rowClassName
                    )}
                  >
                    {selectable && (
                      <td
                        className="w-10 px-4 py-3"
                        onClick={(e) => { e.stopPropagation(); toggleRow(id); }}
                      >
                        <Checkbox checked={selected} onChange={() => toggleRow(id)} />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-3 text-neutral-700 dark:text-neutral-300', col.className)}
                      >
                        {col.render
                          ? col.render(row, i)
                          : row[col.key] ?? <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        }
                      </td>
                    ))}
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
