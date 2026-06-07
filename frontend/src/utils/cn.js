/**
 * Tiny class-name merge utility (no dependencies).
 * Filters falsy values, joins with space.
 */
export function cn(...args) {
  return args
    .flat(Infinity)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
