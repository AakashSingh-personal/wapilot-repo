import { cn } from '../../utils/cn.js';

const sizeClasses = {
  xs: 'w-3 h-3 border-[1.5px]',
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-2',
  xl: 'w-8 h-8 border-[3px]',
};

export function Spinner({ size = 'md', className }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'rounded-full border-neutral-200 dark:border-neutral-700 border-t-brand-500 animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );
}

export default Spinner;
