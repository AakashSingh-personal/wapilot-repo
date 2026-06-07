import { cn } from '../../utils/cn.js';

/**
 * Card — compound component: Card, Card.Header, Card.Body, Card.Footer
 * Usage:
 *   <Card>
 *     <Card.Header title="..." action={<Button>...</Button>} />
 *     <Card.Body>...</Card.Body>
 *     <Card.Footer>...</Card.Footer>
 *   </Card>
 */
export function Card({ className, noPadding = false, children, ...props }) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ title, subtitle, action, className, children }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 py-4',
        'border-b border-neutral-100 dark:border-neutral-800',
        className
      )}
    >
      {(title || subtitle) && (
        <div className="min-w-0 flex-1">
          {title && (
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
};

Card.Body = function CardBody({ className, children, ...props }) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
};

Card.Footer = function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'px-5 py-3.5 border-t border-neutral-100 dark:border-neutral-800',
        'flex items-center gap-3',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
