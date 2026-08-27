import type { ElementType, ReactNode } from 'react';

export type MaterialLevel = 'thin' | 'regular' | 'thick';

/** §6.4: translucency where WebKitGTK supports backdrop-filter, an opaque surface
 *  at the same lightness where it does not. The switch is CSS-only, keyed off the
 *  data-backdrop attribute set once at startup, so layout is identical either way. */
export function Material({ level = 'regular', as: Tag = 'div', className = '', children, ...rest }: {
  level?: MaterialLevel;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
} & Record<string, unknown>) {
  return (
    <Tag className={`material material-${level} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
