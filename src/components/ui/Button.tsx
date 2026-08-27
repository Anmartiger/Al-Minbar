import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'filled' | 'tinted' | 'plain';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({ variant = 'filled', size = 'md', className = '', children, ...rest }: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size !== 'md' ? `btn-${size}` : ''} ${className}`
        .replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Icon-only button. `label` is required - it is the accessible name. */
export function IconButton({ label, active = false, className = '', children, ...rest }: {
  label: string;
  active?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      className={`icon-btn ${active ? 'icon-btn-active' : ''} ${className}`
        .replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
