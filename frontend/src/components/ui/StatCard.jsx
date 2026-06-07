import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { cn } from '../../utils/cn.js';

/**
 * StatCard — metric card with optional sparkline and trend indicator.
 */
export function StatCard({
  title,
  value,
  subtitle,
  trend,         // { value: number, label?: string } positive=up, negative=down
  icon: Icon,
  iconColor = 'brand',
  sparklineData, // array of { v: number } for sparkline
  loading = false,
  className,
}) {
  const trendPositive = trend?.value > 0;
  const trendNeutral  = trend?.value === 0 || trend?.value == null;

  const iconBg = {
    brand:   'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400',
    success: 'bg-success-50 dark:bg-success-950/50 text-success-600 dark:text-success-400',
    warning: 'bg-warning-50 dark:bg-warning-950/50 text-warning-600 dark:text-warning-400',
    error:   'bg-error-50 dark:bg-error-950/50 text-error-600 dark:text-error-400',
    info:    'bg-info-50 dark:bg-info-950/50 text-info-600 dark:text-info-400',
    purple:  'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400',
    orange:  'bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400',
  }[iconColor] || 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500';

  const sparkColor = {
    brand:   '#10b981',
    success: '#22c55e',
    warning: '#f59e0b',
    error:   '#ef4444',
    info:    '#3b82f6',
    purple:  '#8b5cf6',
    orange:  '#f97316',
  }[iconColor] || '#10b981';

  if (loading) {
    return (
      <div className={cn(
        'bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5',
        className
      )}>
        <div className="flex items-start justify-between mb-3">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton w-9 h-9 rounded-lg" />
        </div>
        <div className="skeleton h-7 w-20 rounded mb-2" />
        <div className="skeleton h-3 w-32 rounded" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5',
        'flex flex-col gap-1',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm text-neutral-500 dark:text-neutral-500 font-medium truncate">
          {title}
        </p>
        {Icon && (
          <div className={cn('rounded-lg p-2 shrink-0', iconBg)}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tabular-nums animate-count-up">
        {value}
      </p>

      <div className="flex items-center justify-between gap-2 mt-1">
        {trend ? (
          <div className="flex items-center gap-1">
            {trendNeutral ? (
              <Minus className="w-3.5 h-3.5 text-neutral-400" />
            ) : trendPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-success-500" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-error-500" />
            )}
            <span
              className={cn(
                'text-xs font-medium',
                trendNeutral
                  ? 'text-neutral-400'
                  : trendPositive
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-error-600 dark:text-error-400'
              )}
            >
              {trendNeutral
                ? 'No change'
                : `${trendPositive ? '+' : ''}${trend.value}%`}
            </span>
            {trend.label && (
              <span className="text-xs text-neutral-400">{trend.label}</span>
            )}
          </div>
        ) : (
          subtitle && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">{subtitle}</p>
          )
        )}

        {sparklineData?.length > 1 && (
          <div className="w-16 h-8 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={sparkColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  fill={`url(#spark-${title})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default StatCard;
