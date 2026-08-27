import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SPRING, DURATION } from '../../design/motion';
import { Material } from './Material';

/* -------------------------------- Sheet -------------------------------- */

export type SheetSide = 'bottom' | 'side';

/**
 * §6.5: sheets are things a finger would "grab", so they spring rather than run a
 * duration, and they drag to dismiss. §10 requires Esc to close them.
 * With prefers-reduced-motion the transform collapses to an opacity fade and
 * dragging is disabled - there is nothing to grab if nothing moves.
 */
export function Sheet({ open, onClose, side = 'bottom', title, children }: {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: string;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const axis = side === 'bottom' ? 'y' : 'x';
  const hidden = reduced ? { opacity: 0 } : side === 'bottom' ? { y: '100%' } : { x: '100%' };
  const shown = reduced ? { opacity: 1 } : side === 'bottom' ? { y: 0 } : { x: 0 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.micro }}
            onClick={onClose}
          />
          <Material
            level="thick"
            as={motion.div}
            className={`sheet sheet-${side}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={reduced ? { duration: DURATION.micro } : SPRING}
            drag={reduced ? false : axis}
            dragConstraints={side === 'bottom' ? { top: 0, bottom: 0 } : { left: 0, right: 0 }}
            dragElastic={{ top: 0, bottom: 0.6, left: 0, right: 0.6 }}
            onDragEnd={(_: unknown, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => {
              const offset = side === 'bottom' ? info.offset.y : info.offset.x;
              const velocity = side === 'bottom' ? info.velocity.y : info.velocity.x;
              if (offset > 90 || velocity > 550) onClose();
            }}
          >
            {side === 'bottom' && <div className="sheet-grip" aria-hidden />}
            {title && (
              <div className="sheet-header">
                <h2 className="sheet-title" id={titleId}>{title}</h2>
              </div>
            )}
            <div className="sheet-body">{children}</div>
          </Material>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------- Popover ------------------------------- */

/** Dismisses on outside click and Esc. Anchored to its trigger, not modal. */
export function Popover({ trigger, children, label }: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode;
  children: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ onClick: () => setOpen(o => !o), 'aria-expanded': open })}
      <AnimatePresence>
        {open && (
          <Material
            level="thick"
            as={motion.div}
            className="popover"
            role="dialog"
            aria-label={label}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: DURATION.micro }}
            style={{ transformOrigin: 'top center' }}
          >
            {children}
          </Material>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------- Tooltip ------------------------------- */

/** Reveals on hover *and* focus - keyboard users get it too. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <span
      className="tooltip-anchor"
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocusCapture={() => setShown(true)}
      onBlurCapture={() => setShown(false)}
      aria-describedby={shown ? id : undefined}
    >
      {children}
      <AnimatePresence>
        {shown && (
          <motion.span
            className="tooltip" role="tooltip" id={id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DURATION.micro }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* -------------------------------- Toast -------------------------------- */

export type ToastItem = { id: number; text: string; icon?: ReactNode };

/** Toasts are announced politely rather than interrupting. */
export function ToastLayer({ toasts, onDismiss }: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="toast-layer" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <Material
            key={t.id}
            level="thick"
            as={motion.div}
            className="toast"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduced ? { duration: DURATION.micro } : SPRING}
            onClick={() => onDismiss(t.id)}
          >
            {t.icon && <span className="toast-icon">{t.icon}</span>}
            <span>{t.text}</span>
          </Material>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Minimal queue. A provider can wrap this later if more than one screen needs it. */
export function useToasts(timeout = 4000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const dismiss = (id: number) => setToasts(list => list.filter(t => t.id !== id));
  const push = (text: string, icon?: ReactNode) => {
    const id = next.current++;
    setToasts(list => [...list, { id, text, icon }]);
    window.setTimeout(() => dismiss(id), timeout);
  };
  return { toasts, push, dismiss };
}
