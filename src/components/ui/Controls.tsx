import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { SPRING } from '../../design/motion';

/* ------------------------------- Switch -------------------------------- */

/** iOS-style track + knob. Both the knob travel and the track colour are
 *  150ms micro-interactions (§6.5), handled in CSS. */
export function Switch({ checked, onChange, disabled, label }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

/* -------------------------- SegmentedControl --------------------------- */

export type Segment<T extends string> = { value: T; label: string; disabled?: boolean };

/** Radio-group semantics: arrow keys move between options, which is what a
 *  segmented control should do for a keyboard user. */
export function SegmentedControl<T extends string>({ options, value, onChange, disabled }: {
  options: readonly Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (!el || !wrap.current) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options]);

  const move = (dir: 1 | -1) => {
    const enabled = options.filter(o => !o.disabled);
    const i = enabled.findIndex(o => o.value === value);
    if (i < 0) return;
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    onChange(next.value);
  };

  return (
    <div
      ref={wrap}
      className="segctl"
      role="radiogroup"
      onKeyDown={e => {
        if (disabled) return;
        // Logical keys: in RTL the visual order flips, so ArrowRight moves "back".
        const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
        if (e.key === 'ArrowRight') { e.preventDefault(); move(rtl ? -1 : 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); move(rtl ? 1 : -1); }
      }}
    >
      {thumb && (
        <motion.span
          className="segctl-thumb"
          initial={false}
          animate={{ x: thumb.left, width: thumb.width }}
          transition={SPRING}
          style={{ left: 0 }}
        />
      )}
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-value={o.value}
          aria-checked={o.value === value}
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          disabled={disabled || o.disabled}
          className="segctl-option"
          onClick={() => onChange(o.value)}
        >
          <span className="segctl-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- Slider -------------------------------- */

/** Native <input type="range"> under custom styling - the look is hand-built,
 *  keyboard stepping and ARIA come from the platform. */
export function Slider({
  value, min = 0, max = 100, step = 1, onChange, disabled, label, format,
  ...rest
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
  format?: (v: number) => string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const ref = useRef<HTMLInputElement>(null);
  const rtl = ref.current ? getComputedStyle(ref.current).direction === 'rtl' : false;

  return (
    <div className="slider">
      <input
        ref={ref}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%`, '--slider-to': rtl ? 'left' : 'right' } as React.CSSProperties}
        {...rest}
      />
      <span className="slider-value">{format ? format(value) : value}</span>
    </div>
  );
}
