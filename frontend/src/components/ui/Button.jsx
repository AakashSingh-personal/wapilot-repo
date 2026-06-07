import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';
import { Spinner } from './Spinner.jsx';

/**
 * Button — 5 variants × 4 sizes, loading/disabled/icon states.
 *
 * Variants: primary | secondary | ghost | danger | link
 * Sizes:    xs | sm | md | lg
 */

const variantClasses = {
  primary: [
    'bg-brand-600 text-white border border-brand-600',
    'hover:bg-brand-700 hover:border-brand-700',
    'active:bg-brand-800',
    'dark:bg-brand-500 dark:border-brand-500 dark:hover:bg-brand-600 dark:hover:border-brand-600',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'shadow-xs',
  ].join(' '),

  secondary: [
    'bg-white text-neutral-700 border border-neutral-300',
    'hover:bg-neutral-50 hover:border-neutral-400',
    'active:bg-neutral-100',
    'dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700',
    'dark:hover:bg-neutral-700 dark:hover:border-neutral-600',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'shadow-xs',
  ].join(' '),

  ghost: [
    'bg-transparent text-neutral-600 border border-transparent',
    'hover:bg-neutral-100 hover:text-neutral-900',
    'active:bg-neutral-200',
    'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),

  danger: [
    'bg-error-600 text-white border border-error-600',
    'hover:bg-error-700 hover:border-error-700',
    'active:bg-error-800',
    'dark:bg-error-500 dark:border-error-500 dark:hover:bg-error-600',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'shadow-xs',
  ].join(' '),

  link: [
    'bg-transparent text-brand-600 border border-transparent p-0',
    'hover:text-brand-700 hover:underline',
    'dark:text-brand-400 dark:hover:text-brand-300',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'h-auto min-h-0 rounded-none',
  ].join(' '),
};

const sizeClasses = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-5 text-base gap-2 rounded-lg',
};

const spinnerSizes = { xs: 'xs', sm: 'xs', md: 'sm', lg: 'md' };

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon,       // icon-only button (pass Lucide component)
    iconLeft,   // icon before label
    iconRight,  // icon after label
    className,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;
  const isIconOnly = icon && !children;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none',
        'transition-colors duration-[150ms] ease-out',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2',
        sizeClasses[size],
        variantClasses[variant],
        isIconOnly && size === 'xs' && 'w-7 px-0',
        isIconOnly && size === 'sm' && 'w-8 px-0',
        isIconOnly && size === 'md' && 'w-9 px-0',
        isIconOnly && size === 'lg' && 'w-10 px-0',
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size={spinnerSizes[size]} />
          {children && <span>{children}</span>}
        </>
      ) : isIconOnly ? (
        <icon.type {...icon.props} className={cn('w-4 h-4', size === 'lg' && 'w-5 h-5', icon.props?.className)} />
      ) : (
        <>
          {iconLeft && <span className="shrink-0">{iconLeft}</span>}
          {children && <span>{children}</span>}
          {iconRight && <span className="shrink-0">{iconRight}</span>}
        </>
      )}
    </button>
  );
});

export default Button;
