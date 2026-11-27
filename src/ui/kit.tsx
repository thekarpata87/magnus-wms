// Componentes base del Almacena DS (consola). Ver docs/DESIGN_SYSTEM.md
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { Tone } from "./format";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
  /** Si se indica, el botón queda deshabilitado y explica por qué (permisos visibles). */
  disabledReason?: string;
}
export function Button({ variant = "secondary", size = "md", icon, disabledReason, children, className = "", ...rest }: BtnProps) {
  const id = useId();
  const disabled = rest.disabled || !!disabledReason;
  return (
    <span className={disabledReason ? "tip-wrap" : undefined}>
      <button
        {...rest}
        disabled={disabled}
        aria-describedby={disabledReason ? id : undefined}
        className={`btn btn-${variant} btn-${size} ${className}`}
      >
        {icon}
        {children && <span>{children}</span>}
      </button>
      {disabledReason && <span role="tooltip" id={id} className="tip">{disabledReason}</span>}
    </span>
  );
}

export function Pill({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`pill tone-${tone}`}>{dot && <i aria-hidden />}{children}</span>;
}

export function Card({ title, actions, children, pad = true, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-h">
          <h3>{title}</h3>
          <div className="row gap-2">{actions}</div>
        </header>
      )}
      <div className={pad ? "card-b" : undefined}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone, onClick, target }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; onClick?: () => void; target?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`stat ${onClick ? "is-link" : ""}`} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? "t-" + tone : ""}`}>{value}</div>
      <div className="stat-hint">
        {hint}
        {target && <span className="stat-target">Meta {target}</span>}
      </div>
    </Tag>
  );
}

export function Progress({ value, tone = "brand", label = "Avance" }: { value: number; tone?: Tone; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${Math.round(v * 100)} %`}>
      <div className={`progress-bar bg-${tone}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Code({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return onClick ? <button className="code is-link" onClick={onClick}>{children}</button> : <code className="code">{children}</code>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Avatar({ initials, size = 24 }: { initials: string; size?: number }) {
  return <span className="avatar" aria-hidden style={{ width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Patrón ARIA de pestañas: flechas y Inicio/Fin mueven la selección; solo la activa entra en el orden de Tab.
  const onKey = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === value);
    const next = e.key === "ArrowRight" ? idx + 1 : e.key === "ArrowLeft" ? idx - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = (next + items.length) % items.length;
    onChange(items[n].id);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus());
  };
  return (
    <div className="tabs" role="tablist" ref={ref} onKeyDown={onKey}>
      {items.map((i) => (
        <button key={i.id} role="tab" aria-selected={value === i.id} tabIndex={value === i.id ? 0 : -1} className={value === i.id ? "on" : ""} onClick={() => onChange(i.id)}>
          {i.label}
          {i.count !== undefined && <span className="tab-count" aria-label={`${i.count} elementos`}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogo modal accesible: mueve el foco adentro, lo atrapa con Tab, cierra con Esc y lo devuelve al cerrar. */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !node) return;
      const els = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const [a, z] = [els[0], els[els.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    node?.addEventListener("keydown", onKey);
    return () => { node?.removeEventListener("keydown", onKey); if (opener?.isConnected) opener.focus(); };
  }, [open]);
  return ref;
}

export function Drawer({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={`drawer ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id + "t"} aria-describedby={subtitle ? id + "s" : undefined}>
        <header className="drawer-h">
          <div>
            <h2 id={id + "t"}>{title}</h2>
            {subtitle && <div className="muted" id={id + "s"}>{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar panel"><X size={18} /></button>
        </header>
        <div className="drawer-b">{children}</div>
        {footer && <footer className="drawer-f">{footer}</footer>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="overlay centered" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="drawer-h"><h2 id={id}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
        <div className="drawer-b">{children}</div>
        {footer && <footer className="drawer-f">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type ToastTone = "ok" | "warn" | "info";
interface ToastItem { id: number; tone: ToastTone; text: ReactNode }
const ToastCtx = createContext<(text: ReactNode, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: ReactNode, tone: ToastTone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === "ok" ? <CheckCircle2 size={16} /> : t.tone === "warn" ? <AlertTriangle size={16} /> : <Info size={16} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
