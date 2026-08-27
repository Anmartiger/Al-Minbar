import type { ReactNode } from 'react';

export function List({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`list ${className}`.trim()}>{children}</div>;
}

/**
 * §6.6: "inset separators that stop before the row's inline padding - this detail
 * is very visible and usually gotten wrong."
 *
 * The rule is drawn by the row *below* the first one, starts at `--row-inset`
 * rather than the container edge, and runs to the trailing edge. When a row has a
 * leading element the inset is raised so the rule aligns to the text, not to the
 * icon - that is the part usually missed.
 */
export function ListRow({
  title, subtitle, leading, trailing, tinted, disabled, onClick, separatorInset,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  tinted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Overrides where the separator starts. Defaults to aligning with the title. */
  separatorInset?: string;
  className?: string;
}) {
  const interactive = Boolean(onClick) && !disabled;
  const inset = separatorInset ?? (leading ? 'calc(var(--space-4) + 24px + var(--space-3))' : 'var(--space-4)');
  const cls = `listrow ${interactive ? 'listrow-interactive' : ''} ${tinted ? 'listrow-tinted' : ''} ${className}`
    .replace(/\s+/g, ' ').trim();
  const inner = (
    <>
      {leading && <span className="listrow-leading">{leading}</span>}
      <span className="listrow-body">
        <span className="listrow-title">{title}</span>
        {subtitle && <span className="listrow-subtitle">{subtitle}</span>}
      </span>
      {trailing && <span className="listrow-trailing">{trailing}</span>}
    </>
  );
  const style = { '--row-inset': inset } as React.CSSProperties;

  if (!interactive) {
    return <div className={cls} style={style} aria-disabled={disabled || undefined}>{inner}</div>;
  }
  return (
    <button type="button" className={cls} style={style} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  );
}
