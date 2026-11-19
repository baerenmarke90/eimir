import type { CSSProperties } from 'react';
import './DailyEnergyBattery.css';

export type DailyEnergyBatteryLevel = 'empty' | 'low' | 'medium' | 'high';

export function dailyEnergyBatteryLevel(
  value: number | null,
): DailyEnergyBatteryLevel {
  if (value === null) return 'empty';
  if (value <= 30) return 'low';
  if (value <= 60) return 'medium';
  return 'high';
}

/**
 * The app's single Energy (Akku) symbol. The level is carried only by the
 * fill width and the level color; Wir shows no numbers (#1790 slice A,
 * Product Owner 2026-11-13), so callers own the accessible value text.
 */
export function BatteryIcon({
  value,
  showQuestion = false,
  className = '',
}: {
  value: number | null;
  showQuestion?: boolean;
  className?: string;
}) {
  const level = dailyEnergyBatteryLevel(value);
  const fillStyle = {
    '--daily-energy-fill-scale':
      value === null ? 0 : Math.max(0.1, value / 100),
  } as CSSProperties;
  return (
    <svg
      className={`daily-energy-battery-icon ${className}`.trim()}
      data-level={level}
      viewBox="0 0 24 14"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="daily-energy-battery-shell"
        x="1"
        y="2"
        width="19"
        height="10"
        rx="2"
      />
      <rect
        className="daily-energy-battery-tip"
        x="21"
        y="5"
        width="2"
        height="4"
        rx="1"
      />
      {value !== null ? (
        <rect
          className="daily-energy-battery-fill"
          style={fillStyle}
          x="3"
          y="4"
          width="15"
          height="6"
          rx="1"
        />
      ) : showQuestion ? (
        <text
          className="daily-energy-battery-question"
          x="10.5"
          y="9.7"
          textAnchor="middle"
        >
          ?
        </text>
      ) : null}
    </svg>
  );
}
