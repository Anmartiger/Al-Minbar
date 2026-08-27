import type { ReactNode } from 'react';

/* -------------------------------- Badge -------------------------------- */

export type BadgeTone = 'neutral' | 'accent' | 'solid' | 'outline';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/* ----------------------------- ProgressRing ---------------------------- */

/**
 * §7.1 uses this behind the prayer countdown. `value` is 0..1.
 * Indeterminate is deliberately not offered - §6.5 says no spinners where a
 * skeleton will do.
 */
export function ProgressRing({
  value, size = 44, thickness = 4, label, children,
}: {
  value: number;
  size?: number;
  thickness?: number;
  /** Accessible name. Rendered text, if any, goes in `children`. */
  label: string;
  children?: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <span
      className="ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={thickness} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)} />
      </svg>
      {children && <span className="ring-label">{children}</span>}
    </span>
  );
}

/* ------------------------------- Skeleton ------------------------------ */

export function Skeleton({ width = '100%', height = 14, radius, className = '' }: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      aria-hidden
      style={{ display: 'block', width, height, borderRadius: radius }}
    />
  );
}

/* ------------------------------ EmptyState ----------------------------- */

export function EmptyState({ icon, title, body, action }: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <span className="empty-icon">{icon}</span>}
      <span className="empty-title">{title}</span>
      {body && <span className="empty-body">{body}</span>}
      {action}
    </div>
  );
}
