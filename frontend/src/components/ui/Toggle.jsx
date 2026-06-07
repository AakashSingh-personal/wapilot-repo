import { cn } from '../../utils/cn.js';

/**
 * Toggle (switch) component.
 * Usage: <Toggle checked={val} onChange={e => setVal(e.target.checked)} label="Enable AI" />
 */
export function Toggle({ checked, onChange, label, disabled, size = 'md', className, id, ...props }) {
  const toggleId = id || (label ? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const trackSize = {
    sm: 'w-8 h-4',
    md: 'w-10 h-5',
    lg: 'w-12 h-6',
  }[size];

  const thumbSize = {
    sm: 'w-3 h-3 top-0.5 left-0.5 peer-checked:translate-x-4',
    md: 'w-3.5 h-3.5 top-[3px] left-[3px] peer-checked:translate-x-5',
    lg: 'w-4.5 h-4.5 top-[3px] left-[3px] peer-checked:translate-x-6',
  }[size];

  return (
    <label
      htmlFor={toggleId}
      className={cn(
        'inline-flex items-center gap-2.5 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="relative">
        <input
          id={toggleId}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div
          className={cn(
            'rounded-full transition-colors duration-[150ms] ease-out',
            'bg-neutral-300 dark:bg-neutral-700',
            'peer-checked:bg-brand-500',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-1',
            trackSize
          )}
        />
        <div
          className={cn(
            'absolute rounded-full bg-white shadow-sm',
            'transition-transform duration-[150ms] ease-out',
            thumbSize
          )}
        />
      </div>
      {label && (
        <span className="text-sm text-neutral-700 dark:text-neutral-300 font-medium">
          {label}
        </span>
      )}
    </label>
  );
}

export default Toggle;
