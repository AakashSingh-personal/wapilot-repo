/**
 * WaPilot Recharts theme — consistent chart styling across the app.
 * Usage: import { chartDefaults, chartColors, tooltipStyle } from '@/design-system/chartTheme'
 */
import { chartPalette, colors } from './tokens.js';

export { chartPalette };
export const chartColors = chartPalette;

/** Shared tooltip container style (pass as `contentStyle` prop) */
export function tooltipStyle(isDark = false) {
  return {
    backgroundColor: isDark ? colors.neutral[900] : colors.neutral[0],
    border: `1px solid ${isDark ? colors.neutral[700] : colors.neutral[200]}`,
    borderRadius: '8px',
    boxShadow: isDark
      ? '0 4px 12px rgba(0,0,0,0.4)'
      : '0 4px 12px rgba(0,0,0,0.08)',
    fontSize: '12px',
    padding: '8px 12px',
  };
}

export function tooltipLabelStyle(isDark = false) {
  return {
    color: isDark ? colors.neutral[300] : colors.neutral[600],
    fontWeight: 500,
    marginBottom: '4px',
  };
}

/** Shared cartesian grid props */
export const gridProps = (isDark = false) => ({
  stroke: isDark ? colors.neutral[800] : colors.neutral[100],
  strokeDasharray: '3 3',
  vertical: false,
});

/** Shared axis tick style */
export const axisTickStyle = (isDark = false) => ({
  fontSize: 11,
  fill: isDark ? colors.neutral[500] : colors.neutral[400],
  fontFamily: 'Inter, sans-serif',
});

/** Shared axis line style */
export const axisLineStyle = (isDark = false) => ({
  stroke: isDark ? colors.neutral[800] : colors.neutral[200],
});

/** Legend style */
export const legendStyle = (isDark = false) => ({
  fontSize: 12,
  color: isDark ? colors.neutral[400] : colors.neutral[500],
});

/** Shorthand to build a complete chart theme object */
export function buildChartTheme(isDark = false) {
  return {
    colors: chartPalette,
    tooltip: {
      contentStyle: tooltipStyle(isDark),
      labelStyle: tooltipLabelStyle(isDark),
      cursor: { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
    },
    grid: gridProps(isDark),
    axisTick: { style: axisTickStyle(isDark) },
    axisLine: axisLineStyle(isDark),
  };
}
