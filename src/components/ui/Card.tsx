import type { ReactNode } from 'react';

export function Card({ padded = true, raised = false, className = '', children, ...rest }: {
  padded?: boolean;
  raised?: boolean;
  className?: string;
  children?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`card ${padded ? 'card-padded' : ''} ${raised ? 'card-raised' : ''} ${className}`
        .replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
