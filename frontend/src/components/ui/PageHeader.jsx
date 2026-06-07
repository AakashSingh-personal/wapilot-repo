import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn.js';

/**
 * PageHeader — title + optional breadcrumbs + optional action area.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,  // [{label, href?}, ...]
  actions,      // JSX for the right side
  className,
  children,
}) {
  return (
    <div className={cn('flex flex-col gap-1 mb-6', className)}>
      {breadcrumbs?.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 mb-0.5">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-neutral-400" />
              )}
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-xs text-neutral-400">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export default PageHeader;
