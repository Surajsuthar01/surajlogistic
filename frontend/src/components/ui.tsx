import { ArrowLeft, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router-dom';

/* ---------- Status marks ---------- */

export type Tone = 'neutral' | 'go' | 'info' | 'idle' | 'warn' | 'bad' | 'done';

const DOT: Record<Tone, string> = {
  neutral: 'var(--faint)',
  go: 'var(--go)',
  info: 'var(--info)',
  idle: 'var(--plate)',
  warn: 'var(--warn-fill)',
  bad: 'var(--bad)',
  done: 'var(--go)',
};

const STATUS: Record<string, [Tone, string]> = {
  REQUESTED: ['warn', 'To confirm'],
  BOOKED: ['neutral', 'Booked'],
  PICKED_UP: ['info', 'Picked up'],
  IN_TRANSIT: ['go', 'In transit'],
  AT_HUB: ['info', 'At hub'],
  OUT_FOR_DELIVERY: ['idle', 'Out for delivery'],
  DELIVERED: ['done', 'Delivered'],
  NDR: ['warn', 'Delivery failed'],
  RTO: ['bad', 'Returning to sender'],
  RTO_DELIVERED: ['bad', 'Returned to sender'],
  CANCELLED: ['neutral', 'Cancelled'],
  PLANNED: ['neutral', 'Planned'],
  COMPLETED: ['done', 'Completed'],
  IDLE: ['idle', 'Idle'],
  ON_TRIP: ['go', 'On trip'],
  MAINTENANCE: ['warn', 'In workshop'],
  OPEN: ['idle', 'Open'],
  PENDING: ['neutral', 'Pending'],
  ACCEPTED: ['done', 'Accepted'],
  REJECTED: ['neutral', 'Not chosen'],
  DRAFT: ['neutral', 'Draft'],
  SENT: ['info', 'Sent'],
  PAID: ['done', 'Paid'],
  AVAILABLE: ['go', 'Available'],
  OFF: ['neutral', 'Off duty'],
  LOW: ['go', 'Low'],
  MEDIUM: ['warn', 'Medium'],
  HIGH: ['bad', 'High'],
  ACTIVE: ['go', 'Active'],
  REVOKED: ['neutral', 'Revoked'],
  FAILED: ['bad', 'Failed'],
};

/** A coloured mark and a plain word. Used instead of pills so tables stay calm. */
export function StatusMark({ status, label, tone, className = '' }: { status?: string; label?: ReactNode; tone?: Tone; className?: string }) {
  const [t, l]: [Tone, string] = status ? (STATUS[status] ?? ['neutral', status.replace(/_/g, ' ').toLowerCase()]) : ['neutral', ''];
  const useTone = tone ?? t;
  const done = useTone === 'done';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] ${className}`}>
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="6" fill={DOT.done} />
          <path d="M3.4 6.2l1.7 1.7 3.5-3.6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[useTone], boxShadow: useTone === 'idle' ? 'inset 0 0 0 1px rgb(0 0 0 / 0.25)' : undefined }} />
      )}
      <span>{label ?? l}</span>
    </span>
  );
}

export function statusLabel(status: string) {
  return STATUS[status]?.[1] ?? status;
}

/** Small rounded count or tag. Used sparingly. */
export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'bad' | 'warn' | 'go' | 'plate' | 'sign'; title?: string }) {
  const cls = {
    neutral: 'bg-sheet-2 text-muted',
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
    go: 'bg-go-soft text-go',
    plate: 'bg-plate-soft text-ink',
    sign: 'bg-sign-soft text-accent',
  }[tone];
  return (
    <span title={title} className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12.5px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

/** Vehicle registration on a yellow commercial plate. */
export function Plate({ reg, size = 14 }: { reg: string; size?: number }) {
  return (
    <span className="plate" style={{ fontSize: size }}>
      {reg}
    </span>
  );
}

/** Three-step meter for a 0–100 score (RTO risk and similar). */
export function RiskMeter({ score, level }: { score: number; level: 'LOW' | 'MEDIUM' | 'HIGH' | string }) {
  const n = level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1;
  const c = level === 'HIGH' ? 'var(--bad)' : level === 'MEDIUM' ? 'var(--warn-fill)' : 'var(--go)';
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`Return risk ${score} out of 100`}>
      <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className="w-[5px] rounded-[1.5px]" style={{ height: 5 + i * 3, background: i <= n ? c : 'var(--line)' }} />
        ))}
      </span>
      <span className="num text-[14px]">{score}</span>
      <span className="text-[13px] text-muted">{level === 'HIGH' ? 'high' : level === 'MEDIUM' ? 'medium' : 'low'}</span>
    </span>
  );
}

export function Progress({ value, tone = 'go', height = 6 }: { value: number; tone?: 'go' | 'bad' | 'warn' | 'plate'; height?: number }) {
  const c = { go: 'var(--go)', bad: 'var(--bad)', warn: 'var(--warn-fill)', plate: 'var(--plate)' }[tone];
  return (
    <div className="w-full overflow-hidden rounded-full bg-sheet-2" style={{ height, boxShadow: 'inset 0 0 0 1px var(--line)' }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: c }} />
    </div>
  );
}

/* ---------- Buttons ---------- */

type BtnVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'quietDanger';
const btnVariant: Record<BtnVariant, string> = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  secondary: 'btn-secondary',
  ghost: 'text-ink hover:bg-[var(--hover)]',
  danger: 'btn-danger',
  quietDanger: 'text-bad hover:bg-bad-soft',
};
const btnSize = { sm: 'h-8 px-3.5 text-[13.5px]', md: 'h-10 px-[18px] text-[14.5px]', lg: 'h-12 px-6 text-[15.5px]' };

/** Buttons are pills. */
export function btnClass(variant: BtnVariant = 'secondary', size: keyof typeof btnSize = 'md', extra = '') {
  return `inline-flex items-center justify-center gap-1.5 rounded-full font-[540] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${btnSize[size]} ${btnVariant[variant]} ${extra}`;
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof btnSize }) {
  return (
    <button type="button" {...rest} className={btnClass(variant, size, className)}>
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', className = '', children, ...rest }: LinkProps & { variant?: BtnVariant; size?: keyof typeof btnSize }) {
  return (
    <Link {...rest} className={btnClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* ---------- Form controls ---------- */

export function Field({ label, hint, children, htmlFor, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[13.5px] font-[520] text-ink">{label}</span>
      {children}
      {hint && <span className="text-[13px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-11 w-full min-w-0 rounded-[18px] border border-line bg-sheet-2 px-3.5 text-[15px] text-ink placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:bg-sheet focus:outline-none focus:ring-4 focus:ring-sign/15 disabled:opacity-60';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} h-auto min-h-[84px] py-2 leading-snug ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} pr-8 ${props.className ?? ''}`}>
      {children}
    </select>
  );
}

export function Check({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--sign)]" />
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/* ---------- Surfaces ---------- */

/** A white working sheet. Header is optional; tables sit flush inside. */
export function Sheet({ title, aside, children, className = '', pad = true, id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={`sheet min-w-0 ${className}`}>
      {(title || aside) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
          {typeof title === 'string' ? <h2 className="t-sub">{title}</h2> : title}
          {aside}
        </header>
      )}
      <div className={pad ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  );
}

/** Content that sits straight on the ground with a heading — for things that do not need a box. */
export function Block({ title, aside, children, className = '' }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <header className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {typeof title === 'string' ? <h2 className="t-sub">{title}</h2> : title}
        {aside}
      </header>
      {children}
    </section>
  );
}

export function PageHeader({ title, sub, actions, back, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="rise mb-8">
      {back ? (
        <Link to={back.to} className="eyebrow mb-3 inline-flex items-center gap-1.5 hover:text-ink">
          <ArrowLeft size={14} /> {back.label}
        </Link>
      ) : eyebrow ? (
        <p className="eyebrow mb-3">{eyebrow}</p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {typeof title === 'string' ? <h1 className="t-title">{title}</h1> : title}
          {sub && <div className="mt-3 max-w-[70ch] text-[15.5px] leading-relaxed text-muted">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The headline numbers of a page, set like launch telemetry: label, big figure, a line of context. */
export function StatStrip({ items, cols = 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6', className = '' }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' }[]; cols?: string; className?: string }) {
  return (
    <dl className={`stat-strip m-0 grid gap-px bg-line ${cols} ${className}`}>
      {items.map((m, i) => (
        <div key={i} className="stat-cell relative min-w-0 bg-ground px-5 py-5" data-tone={m.tone}>
          <dt className="eyebrow flex items-center gap-2 !text-[11px]">
            {m.tone && <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.tone === 'bad' ? 'var(--bad)' : 'var(--warn-fill)' }} />}
            <span className="truncate">{m.label}</span>
          </dt>
          <dd className={`t-fig m-0 mt-3 text-[40px] sm:text-[46px] ${m.tone === 'bad' ? 'text-bad' : m.tone === 'warn' ? 'text-warn' : ''}`}>{m.value}</dd>
          {m.sub && <dd className="m-0 mt-2 text-[13px] text-muted">{m.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Label-and-value rows for detail pages. */
export function KV({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="shrink-0 text-[14px] text-muted">{k}</dt>
      <dd className={`num m-0 min-w-0 text-right text-[15px] ${strong ? 'font-semibold' : ''}`}>{v}</dd>
    </div>
  );
}

/** Label above value, for compact fact grids. */
export function Fact({ k, v, className = '' }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="font-display font-[560] text-[12px] text-faint">{k}</div>
      <div className="num mt-1 text-[15px] font-[520]">{v}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className = '' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={`no-scrollbar max-w-full overflow-x-auto ${className}`}>
      <div role="tablist" className="seg">
        {items.map((it) => {
          const on = value === it.value;
          return (
            <button key={it.value} role="tab" aria-selected={on} type="button" onClick={() => onChange(it.value)} className="seg-btn">
              {it.label}
              {it.count !== undefined && <span className={`num font-mono text-[11.5px] ${on ? 'text-accent' : 'text-faint'}`}>{it.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Overlays ---------- */

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => box.current?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label="Close"])')?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', k);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(0_0_0/0.6)] backdrop-blur-[3px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} className={`pop-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-sheet sm:rounded-[22px] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`} style={{ boxShadow: 'var(--shadow-pop)' }}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id={id} className="t-head min-w-0 truncate">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-[var(--hover)] hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" style={{ paddingBottom: footer ? undefined : 'max(20px, env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3.5" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-[rgb(0_0_0/0.55)] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-labelledby={id} className="slide-in absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-sheet" style={{ maxWidth: width, boxShadow: 'var(--shadow-pop)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id={id} className="t-head min-w-0 truncate">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-[var(--hover)] hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/* ---------- Feedback ---------- */

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-[12px] border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[14.5px] text-bad">
      {children}
    </p>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'go' | 'warn' }) {
  const c = { neutral: 'border-line bg-sheet-2 text-ink', go: 'border-go/30 bg-go-soft text-ink', warn: 'border-warn-fill/35 bg-warn-soft text-ink' }[tone];
  return <div className={`rounded-[12px] border px-3.5 py-2.5 text-[14.5px] ${c}`}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-4 py-10 sm:px-6">
      <p className="t-sub">{title}</p>
      {children && <div className="max-w-[56ch] text-[14.5px] text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Grey bars where content is about to appear. */
export function Loading({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3 px-4 py-6" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded-full bg-sheet-2" style={{ width: `${88 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/* ---------- Toasts ---------- */

interface ToastMsg {
  id: number;
  text: string;
  tone: 'go' | 'bad';
}
const ToastCtx = createContext<(text: string, tone?: 'go' | 'bad') => void>(() => undefined);

export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: 'go' | 'bad' = 'go') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ bottom: 'max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}>
        {list.map((t) => (
          <div key={t.id} className="pop-in island pointer-events-auto flex max-w-[460px] items-center gap-2.5 !rounded-full px-5 py-2.5 text-[14.5px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.tone === 'go' ? 'var(--map-go)' : 'var(--map-late)' }} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
