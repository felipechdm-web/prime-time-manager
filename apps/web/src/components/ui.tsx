// Componentes base da interface.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GENRES } from '@engine/catalog/genres.ts';
import type { GenreId } from '@engine/types.ts';
import { useUI } from '../lib/ui.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent2';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  title?: string;
  full?: boolean;
}) {
  const v = props.variant ?? 'secondary';
  const s = props.size ?? 'md';
  const base = 'inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none rounded-theme select-none';
  const sizes = { sm: 'text-xs px-2.5 py-1.5 min-h-8', md: 'text-sm px-3.5 py-2 min-h-10', lg: 'text-base px-5 py-3 min-h-12' };
  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-accent-contrast hover:brightness-110 shadow-sm',
    secondary: 'bg-surface-2 text-text border border-border hover:bg-surface-3',
    ghost: 'text-muted hover:text-text hover:bg-surface-2',
    danger: 'bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25',
    accent2: 'bg-accent-2 text-black hover:brightness-110',
  };
  return (
    <button
      type={props.type ?? 'button'}
      title={props.title}
      disabled={props.disabled || props.busy}
      onClick={props.onClick}
      className={`${base} ${sizes[s]} ${variants[v]} ${props.full ? 'w-full' : ''} ${props.className ?? ''}`}
    >
      {props.busy && <Spinner small />}
      {props.children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-3.5 w-3.5' : 'h-6 w-6'}`} aria-label="carregando" />;
}

export function Card({ children, className, title, action, crt }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; crt?: boolean }) {
  return (
    <section className={`card relative ${crt ? 'crt' : ''} ${className ?? ''}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h3>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    good: 'bg-good/15 text-good',
    bad: 'bg-bad/15 text-bad',
    warn: 'bg-warn/15 text-warn',
    accent: 'bg-accent/20 text-accent',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className ?? ''}`}>{children}</span>;
}

// dica explicativa: passa o mouse (desktop) ou toca (celular)
export function Tip({ text, children }: { text: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex items-center" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <button type="button" aria-label="Como foi calculado" onClick={() => setOpen((o) => !o)} className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted hover:text-text">
        i
      </button>
      {open && (
        <span role="tooltip" className="fade-in absolute left-1/2 top-full z-50 mt-1 w-64 max-w-[80vw] -translate-x-1/2 rounded-lg border border-border bg-surface-3 p-2.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-text shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

export function Stat({ label, value, sub, tip, tone }: { label: string; value: ReactNode; sub?: ReactNode; tip?: string; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-text';
  return (
    <div className="card px-3 py-2.5">
      <div className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted">
        {tip ? <Tip text={tip}>{label}</Tip> : label}
      </div>
      <div className={`tabular mt-0.5 text-xl font-bold font-display ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} />
      <div className={`fade-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-surface-2 hover:text-text" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-border bg-surface-2 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={`scrollbar-thin flex gap-1 overflow-x-auto rounded-theme bg-surface-2 p-1 ${className ?? ''}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`shrink-0 whitespace-nowrap rounded-[calc(var(--radius)-4px)] px-3 py-1.5 text-sm font-semibold transition ${value === it.id ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-theme border border-dashed border-border p-6 text-center text-sm text-muted">
      <div className="font-semibold text-text">{title}</div>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function GenreChip({ genre, small }: { genre: GenreId; small?: boolean }) {
  const g = GENRES[genre];
  if (!g) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 ${small ? 'text-[10px]' : 'text-[11px]'} font-semibold`} style={{ borderColor: `${g.color}66`, color: g.color, background: `${g.color}14` }}>
      <span aria-hidden>{g.icon}</span>
      {g.name}
    </span>
  );
}

export function StationDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

export function Bar({ value, max = 100, tone = 'accent' }: { value: number; max?: number; tone?: 'accent' | 'good' | 'bad' | 'warn' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = { accent: 'bg-accent', good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn' };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = 'w-full rounded-theme border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3 sm:top-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`fade-in pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 text-left text-sm shadow-xl ${
            t.kind === 'error' ? 'border-bad/50 bg-[#2a1215] text-bad' : t.kind === 'success' ? 'border-good/40 bg-[#0f2219] text-good' : t.kind === 'warn' ? 'border-warn/40 bg-[#2a2210] text-warn' : 'border-border bg-surface-3 text-text'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ emoji, name, mood }: { emoji: string; name: string; mood?: number }) {
  const ring = mood === undefined ? 'ring-border' : mood > 20 ? 'ring-good' : mood < -20 ? 'ring-bad' : 'ring-warn';
  return (
    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-lg ring-2 ${ring}`} title={name}>
      {emoji}
    </span>
  );
}

export function moodLabel(m: number): string {
  if (m > 40) return 'animado';
  if (m > 10) return 'satisfeito';
  if (m > -10) return 'neutro';
  if (m > -40) return 'irritado';
  return 'furioso';
}
