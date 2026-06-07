import { useState, useMemo } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { Table } from './Table.jsx';
import { SearchBar } from './SearchBar.jsx';
import { Pagination } from './Pagination.jsx';
import { FilterChipGroup } from './FilterChip.jsx';
import { Button } from './Button.jsx';

/**
 * DataTable — Table with integrated search, filter chips, row count, pagination, and toolbar actions.
 *
 * All Table props are forwarded. Additional props:
 *   searchValue     — controlled search string
 *   onSearchChange  — (value: string) => void
 *   searchPlaceholder
 *   filterChips     — ReactNode  — rendered inside <FilterChipGroup>
 *   onClearFilters  — () => void — shows "Clear filters" link when provided
 *   activeFilters   — number    — shows a badge on the filter area
 *   page            — current page (1-based)
 *   pageSize        — rows per page
 *   totalRows       — total (for pagination info)
 *   onPageChange    — (page) => void
 *   onRefresh       — () => void — shows a refresh button if provided
 *   onExport        — () => void — shows an export button if provided
 *   toolbarActions  — ReactNode  — extra toolbar actions (right side)
 *   showRowCount    — boolean (default true) — show "N results" label
 *   className
 *   tableClassName
 *   size, striped, sticky — forwarded to Table
 */
export function DataTable({
  // Search
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  // Filters
  filterChips,
  onClearFilters,
  activeFilters = 0,
  // Pagination
  page,
  pageSize,
  totalRows,
  onPageChange,
  // Toolbar
  onRefresh,
  onExport,
  toolbarActions,
  showRowCount = true,
  // Layout
  className,
  tableClassName,
  // Table props (forwarded)
  columns = [],
  rows = [],
  loading = false,
  skeletonRows = 5,
  selectable,
  selectedIds,
  onSelectionChange,
  getRowId,
  sortKey,
  sortDir,
  onSort,
  emptyState,
  bulkActions,
  rowClassName,
  onRowClick,
  size = 'md',
  striped = false,
  sticky = false,
}) {
  const displayCount = totalRows ?? rows.length;
  const totalPages = pageSize && totalRows != null ? Math.ceil(totalRows / pageSize) : 0;

  const hasSearch = onSearchChange != null;
  const hasFilters = filterChips != null || activeFilters > 0;
  const hasToolbar = hasSearch || hasFilters || onRefresh || onExport || toolbarActions;
  const hasPagination = onPageChange != null && totalPages > 1;

  return (
    <div className={cn('flex flex-col', className)}>
      {/* ── Toolbar ── */}
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          {/* Left: row count + filter chips */}
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            {showRowCount && (
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap shrink-0">
                {loading ? (
                  <span className="inline-block w-12 h-3.5 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                ) : (
                  <>{displayCount} result{displayCount !== 1 ? 's' : ''}</>
                )}
              </span>
            )}
            {hasFilters && (
              <FilterChipGroup onClearAll={onClearFilters}>
                {filterChips}
              </FilterChipGroup>
            )}
          </div>

          {/* Right: search + actions */}
          <div className="flex items-center gap-2 shrink-0">
            {hasSearch && (
              <SearchBar
                value={searchValue}
                onChange={onSearchChange}
                placeholder={searchPlaceholder}
                className="w-52"
              />
            )}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />}
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh"
              />
            )}
            {onExport && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Download className="w-4 h-4" />}
                onClick={onExport}
                aria-label="Export"
              />
            )}
            {toolbarActions}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        skeletonRows={skeletonRows}
        selectable={selectable}
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
        getRowId={getRowId}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        emptyState={emptyState}
        bulkActions={bulkActions}
        rowClassName={rowClassName}
        onRowClick={onRowClick}
        size={size}
        striped={striped}
        sticky={sticky}
        className={tableClassName}
      />

      {/* ── Pagination footer ── */}
      {hasPagination && (
        <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            total={totalRows}
            pageSize={pageSize}
            showInfo
          />
        </div>
      )}
    </div>
  );
}

export default DataTable;
