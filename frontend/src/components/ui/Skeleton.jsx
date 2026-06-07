import { cn } from '../../utils/cn.js';

/**
 * Skeleton — shimmer placeholder for loading states.
 * Pre-built variants: Text, Title, Avatar, Button, Card, TableRow
 */
export function Skeleton({ className, style }) {
  return (
    <div
      className={cn('skeleton', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

Skeleton.Text = function SkeletonText({ lines = 3, lastLineWidth = '60%', className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5 rounded"
          style={{ width: i === lines - 1 && lastLineWidth ? lastLineWidth : '100%' }}
        />
      ))}
    </div>
  );
};

Skeleton.Title = function SkeletonTitle({ className }) {
  return <Skeleton className={cn('h-5 w-2/5 rounded', className)} aria-hidden="true" />;
};

Skeleton.Avatar = function SkeletonAvatar({ size = 'md', className }) {
  const sizes = { xs: 'w-6 h-6', sm: 'w-7 h-7', md: 'w-8 h-8', lg: 'w-10 h-10', xl: 'w-12 h-12' };
  return (
    <Skeleton className={cn('rounded-full shrink-0', sizes[size], className)} aria-hidden="true" />
  );
};

Skeleton.Button = function SkeletonButton({ className }) {
  return <Skeleton className={cn('h-9 w-24 rounded-lg', className)} aria-hidden="true" />;
};

Skeleton.Card = function SkeletonCard({ lines = 3, className }) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 mb-4">
        <Skeleton.Avatar />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-1/3 rounded" />
          <Skeleton className="h-3 w-1/5 rounded" />
        </div>
      </div>
      <Skeleton.Text lines={lines} />
    </div>
  );
};

Skeleton.TableRow = function SkeletonTableRow({ cols = 5, className }) {
  return (
    <div
      className={cn('flex items-center gap-4 px-4 py-3', className)}
      aria-hidden="true"
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 rounded"
          style={{ flex: i === 0 ? '0 0 20px' : 1 }}
        />
      ))}
    </div>
  );
};

Skeleton.StatCard = function SkeletonStatCard({ className }) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-24 rounded mb-2" />
      <Skeleton className="h-3 w-32 rounded" />
    </div>
  );
};

export default Skeleton;
