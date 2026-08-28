import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------------ Button */
type Variant = 'default' | 'primary' | 'ghost' | 'outline' | 'right' | 'wrong';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'default',
  size = 'md',
  block,
  className = '',
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */
export function Card({
  children,
  className = '',
  quiet,
  flush,
  ...rest
}: { children: ReactNode; className?: string; quiet?: boolean; flush?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['card', quiet ? 'card--quiet' : '', flush ? 'card--flush' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- Chip */
export function Chip({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: 'default' | 'right' | 'wrong' | 'streak' | 'solid';
  className?: string;
}) {
  return (
    <span className={['chip', tone !== 'default' ? `chip--${tone}` : '', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Progress */
export function Progress({
  value,
  max = 1,
  slim,
  tone,
  label,
}: {
  value: number;
  max?: number;
  slim?: boolean;
  tone?: 'right';
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div
      className={['progress', slim ? 'progress--slim' : '', tone ? `progress--${tone}` : ''].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress__fill" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Ring({
  value,
  size = 44,
  stroke = 4,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="ringwrap" style={{ width: size, height: size }}>
      <svg className="ring" width={size} height={size} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      {children ? <div className="ringwrap__center">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Hearts */
export function Hearts({ left, total, breaking }: { left: number; total: number; breaking?: boolean }) {
  return (
    <div className="hearts" aria-label={`${left} of ${total} hearts left`}>
      {Array.from({ length: total }, (_, i) => {
        const spent = i >= left;
        const justLost = breaking && i === left;
        return (
          <svg
            key={i}
            className={`heart${spent ? ' heart--spent' : ''}${justLost ? ' heart--losing' : ''}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 21s-8-5.1-8-10.4A4.6 4.6 0 0 1 12 7.6 4.6 4.6 0 0 1 20 10.6C20 15.9 12 21 12 21z" />
          </svg>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- Segmented */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="segmented__item"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Tooltip */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="tip">
      {children}
      <span className="tip__body" role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ------------------------------------------------------------------ Toasts */
interface Toast {
  id: number;
  text: string;
  icon?: string;
}
const ToastCtx = createContext<(text: string, icon?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, icon?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.icon ? <span className="toast__icon">{t.icon}</span> : null}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
