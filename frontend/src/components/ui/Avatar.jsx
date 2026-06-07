import { cn } from '../../utils/cn.js';

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
  xl: 'w-12 h-12 text-lg',
  '2xl': 'w-16 h-16 text-xl',
};

const colorClasses = [
  'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300',
  'bg-info-100 text-info-700 dark:bg-info-900 dark:text-info-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  'bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-300',
];

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

function getColorIndex(name) {
  if (!name) return 0;
  return name.charCodeAt(0) % colorClasses.length;
}

/**
 * Avatar — image with fallback to initials
 */
export function Avatar({ src, name, size = 'md', className, status }) {
  const initials = getInitials(name);
  const colorCls = colorClasses[getColorIndex(name)];

  const statusDot = {
    online:  'bg-success-500',
    away:    'bg-warning-500',
    offline: 'bg-neutral-400',
    busy:    'bg-error-500',
  }[status];

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className={cn('rounded-full object-cover', sizeClasses[size])}
          onError={e => { e.target.style.display = 'none'; }}
        />
      ) : (
        <div
          className={cn(
            'rounded-full flex items-center justify-center font-semibold select-none',
            sizeClasses[size],
            colorCls
          )}
          aria-label={name}
        >
          {initials}
        </div>
      )}
      {status && statusDot && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-white dark:ring-neutral-900',
            size === 'xs' || size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5',
            statusDot
          )}
        />
      )}
    </div>
  );
}

/**
 * Avatar.Group — stacked avatars with overflow count
 */
Avatar.Group = function AvatarGroup({ avatars = [], max = 4, size = 'sm', className }) {
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - max;

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visible.map((av, i) => (
        <Avatar
          key={i}
          src={av.src}
          name={av.name}
          size={size}
          className="ring-2 ring-white dark:ring-neutral-900"
        />
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            'rounded-full flex items-center justify-center font-semibold text-xs',
            'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300',
            'ring-2 ring-white dark:ring-neutral-900',
            sizeClasses[size]
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

export default Avatar;
