import { X } from 'lucide-react';
import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'route';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-panel-2 text-muted border-line',
  good: 'bg-good-soft text-good border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  bad: 'bg-bad-soft text-bad border-transparent',
  accent: 'bg-accent-soft text-accent-ink border-transparent',
  route: 'bg-route-soft text-route border-transparent',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12.5px] font-medium leading-5 ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  BOOKED: 'neutral', PICKED_UP: 'route', IN_TRANSIT: 'route', AT_HUB: 'route', OUT_FOR_DELIVERY: 'accent', DELIVERED: 'good', NDR: 'warn', RTO: 'bad', RTO_DELIVERED: 'bad', CANCELLED: 'neutral',
  PLANNED: 'neutral', COMPLETED: 'good', IDLE: 'accent', ON_TRIP: 'route', MAINTENANCE: 'warn', OPEN: 'accent', PENDING: 'neutral', ACCEPTED: 'good', REJECTED: 'neutral',
  DRAFT: 'neutral', SENT: 'warn', PAID: 'good', AVAILABLE: 'good', OFF: 'neutral', LOW: 'good', MEDIUM: 'warn', HIGH: 'bad',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btnClass: Record<BtnVariant, string> = {
  primary: 'bg-ink text-panel hover:opacity-90',
  secondary: 'bg-panel text-ink border border-line hover:bg-panel-2',
  ghost: 'text-ink hover:bg-panel-2',
  danger: 'bg-bad text-white hover:opacity-90',
};

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'h-8 px-3 text-[13.5px]' : 'h-10 px-4 text-[14.5px]'} ${btnClass[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex min-w-0 flex-col gap-1">
      <span className="text-[13.5px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full min-w-0 rounded-[10px] border border-line bg-panel px-3 text-[14.5px] text-ink placeholder:text-muted/70 focus:border-route focus:outline-none';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} pr-8 ${props.className ?? ''}`}>
      {children}
    </select>
  );
}

export function Panel({ title, action, children, className = '', bodyClass = 'p-4' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel min-w-0 ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {typeof title === 'string' ? <h2 className="text-[17px] font-semibold">{title}</h2> : title}
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[14.5px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={`panel max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-b-[14px] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`} style={{ boxShadow: 'var(--shadow)' }}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3">
          <h2 id={id} className="text-[19px] font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-[10px] bg-bad-soft px-3 py-2 text-[14px] text-bad">{children}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 px-4 py-8">
      <p className="font-medium">{title}</p>
      {children && <div className="text-[14px] text-muted">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p className="px-4 py-8 text-[14px] text-muted">{label}…</p>;
}

/** A label/value pair used in detail panels. */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="text-[13.5px] text-muted">{k}</span>
      <span className="num min-w-0 text-right text-[14.5px]">{v}</span>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-[12px] border border-line bg-panel p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={`h-8 rounded-[9px] px-3 text-[14px] font-medium ${value === it.value ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
