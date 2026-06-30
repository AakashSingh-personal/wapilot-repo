/**
 * Vartalap Design System – JS tokens
 * Mirror of tailwind.config.js values for use in Recharts and dynamic styles.
 */

export const colors = {
  brand: {
    25:  '#f0fdf8',
    50:  '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  neutral: {
    0:   '#ffffff',
    50:  '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    850: '#172033',
    900: '#0f172a',
    950: '#020617',
  },
  success: { 50: '#f0fdf4', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
  warning: { 50: '#fffbeb', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  error:   { 50: '#fff1f2', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
  info:    { 50: '#eff6ff', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
  purple:  { 50: '#faf5ff', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  pink:    { 50: '#fdf2f8', 400: '#f472b6', 500: '#ec4899', 600: '#db2777' },
  orange:  { 50: '#fff7ed', 400: '#fb923c', 500: '#f97316', 600: '#ea580c' },
};

// Appointment status → color mappings
export const appointmentStatusColors = {
  PENDING:     { bg: '#fffbeb', text: '#b45309', border: '#fcd34d', dark: { bg: '#451a03', text: '#fbbf24' } },
  CONFIRMED:   { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd', dark: { bg: '#172554', text: '#60a5fa' } },
  CHECKED_IN:  { bg: '#f0fdf4', text: '#15803d', border: '#86efac', dark: { bg: '#052e16', text: '#4ade80' } },
  IN_PROGRESS: { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd', dark: { bg: '#2e1065', text: '#a78bfa' } },
  COMPLETED:   { bg: '#f0fdf4', text: '#15803d', border: '#6ee7b7', dark: { bg: '#052e16', text: '#34d399' } },
  RESCHEDULED: { bg: '#eff6ff', text: '#2563eb', border: '#60a5fa', dark: { bg: '#172554', text: '#93c5fd' } },
  CANCELLED:   { bg: '#fff1f2', text: '#b91c1c', border: '#fca5a5', dark: { bg: '#450a0a', text: '#f87171' } },
  NO_SHOW:     { bg: '#f8fafc', text: '#475569', border: '#cbd5e1', dark: { bg: '#0f172a', text: '#94a3b8' } },
};

// Payment status colors
export const paymentStatusColors = {
  PENDING: appointmentStatusColors.PENDING,
  PAID:    appointmentStatusColors.COMPLETED,
  FAILED:  appointmentStatusColors.CANCELLED,
  REFUNDED: { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd', dark: { bg: '#2e1065', text: '#a78bfa' } },
};

// Chart color palette
export const chartPalette = [
  colors.brand[500],
  colors.info[500],
  colors.purple[500],
  colors.orange[500],
  colors.pink[500],
  colors.success[500],
  colors.warning[500],
  colors.error[500],
];

// Spacing
export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
};

// Layout
export const layout = {
  sidebarWidth: '240px',
  sidebarCollapsedWidth: '60px',
  topbarHeight: '56px',
};
