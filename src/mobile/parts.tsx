// Piezas del handheld: feedback (color + sonido + vibración), escáner, teclado numérico.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ScanLine, Delete, Minus, Plus, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ---------- Feedback multisensorial ----------
let audio: AudioContext | null = null;
function beep(ok: boolean, { sound = true, vibrate = true } = {}) {
  if (vibrate) navigator.vibrate?.(ok ? 40 : [90, 60, 90]);
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    const tones = ok ? [[1320, 0.07]] : [[220, 0.12], [180, 0.16]];
    let t = audio.currentTime;
    for (const [f, d] of tones) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = ok ? "sine" : "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + d);
      t += d + 0.03;
    }
  } catch { /* sin audio */ }
}

interface Flash { ok: boolean; text: string; id: number }
const FeedbackCtx = createContext<(ok: boolean, text: string) => void>(() => {});
const LastCtx = createContext<Flash | null>(null);
export const useFeedback = () => useContext(FeedbackCtx);

export function FeedbackProvider({ children, sound = true, vibrate = true }: { children: ReactNode; sound?: boolean; vibrate?: boolean }) {
  const [flash, setFlash] = useState<Flash | null>(null);
  const [last, setLast] = useState<Flash | null>(null);
  const fire = useCallback((ok: boolean, text: string) => {
    beep(ok, { sound, vibrate });
    const id = Date.now();
    setFlash({ ok, text, id });
    setLast({ ok, text, id });
    setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), ok ? 650 : 1500);
  }, [sound, vibrate]);
  return (
    <FeedbackCtx.Provider value={fire}>
      <LastCtx.Provider value={last}>{children}</LastCtx.Provider>
      {flash && (
        <div className={`hh-flash ${flash.ok ? "ok" : "err"}`} role={flash.ok ? "status" : "alert"} onClick={() => setFlash(null)}>
          <strong aria-hidden>{flash.ok ? "✓" : "✕"}</strong>
          <span className="sr-only">{flash.ok ? "Correcto:" : "Error:"}</span>
          <span>{flash.text}</span>
        </div>
      )}
    </FeedbackCtx.Provider>
  );
}

// ---------- Campo de escaneo ----------
// Acepta el "gatillo" de escáneres USB/Bluetooth (teclado + Enter). Se mantiene con foco.
export function ScanField({ onScan, placeholder = "Escanea…", hint, simulate, disabled }: {
  onScan: (code: string) => void;
  placeholder?: string;
  hint?: string;
  /** Códigos para simular el gatillo en el prototipo */
  simulate?: { label: string; code: string; wrong?: boolean }[];
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState("");
  const last = useContext(LastCtx);
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (disabled) return;
    const keep = () => {
      const a = document.activeElement;
      if (!a || a === document.body) ref.current?.focus({ preventScroll: true });
    };
    keep();
    const t = setInterval(keep, 400);
    return () => clearInterval(t);
  }, [disabled]);
  const submit = (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setV("");
    onScan(c);
  };
  return (
    <div className="hh-scan">
      <div className="hh-scan-in">
        <ScanLine size={22} />
        <input ref={ref} value={v} disabled={disabled} placeholder={placeholder} inputMode="none" autoComplete="off" autoCapitalize="characters"
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit(v)} aria-label={placeholder} />
      </div>
      {hint && <div className="hh-scan-hint">{hint}</div>}
      {/* El flash dura 1.5 s; el último resultado queda visible para quien no alcanzó a leerlo */}
      {last && last.id >= mountedAt && <div className={`hh-last ${last.ok ? "ok" : "err"}`}><span aria-hidden>{last.ok ? "✓" : "✕"}</span>{last.text}</div>}
      {simulate && simulate.length > 0 && (
        <div className="hh-sim">
          <span>Simular gatillo:</span>
          {simulate.map((s) => (
            <button key={s.label + s.code} className={s.wrong ? "wrong" : ""} onClick={() => submit(s.code)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Cantidad: +/- grandes y teclado propio ----------
export function QtyPad({ value, onChange, max, unit = "pzas" }: { value: number; onChange: (n: number) => void; max?: number; unit?: string }) {
  const [typing, setTyping] = useState(false);
  const press = (d: string) => {
    const base = typing ? String(value) : "";
    const next = Number((base + d).slice(0, 5));
    setTyping(true);
    onChange(max !== undefined ? Math.min(next, max * 10) : next);
  };
  return (
    <div className="hh-qty">
      <div className="hh-qty-row">
        <button className="hh-round" onClick={() => { setTyping(false); onChange(Math.max(0, value - 1)); }} aria-label="Restar uno"><Minus size={28} /></button>
        <div className="hh-qty-val" aria-live="polite" aria-atomic="true"><strong>{value}</strong><span>{unit}{max !== undefined && ` de ${max}`}</span></div>
        <button className="hh-round" onClick={() => { setTyping(false); onChange(value + 1); }} aria-label="Sumar uno"><Plus size={28} /></button>
      </div>
      <div className="hh-keys" role="group" aria-label="Teclado numérico">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <button onClick={() => { setTyping(false); onChange(0); }} className="muted" aria-label="Borrar cantidad">C</button>
        <button onClick={() => press("0")}>0</button>
        <button onClick={() => { const s = String(value).slice(0, -1); setTyping(true); onChange(Number(s) || 0); }} aria-label="Borrar"><Delete size={22} /></button>
      </div>
    </div>
  );
}

// ---------- Estructura de pantalla de tarea ----------
export function TaskScreen({ title, context, progress, children, primary, secondary, back = "/handheld" }: {
  title: string;
  context?: ReactNode;
  progress?: [number, number];
  children: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  back?: string;
}) {
  const nav = useNavigate();
  return (
    <div className="hh-screen">
      <header className="hh-ctx">
        <button className="hh-back" onClick={() => nav(back)} aria-label="Volver"><ChevronLeft size={26} aria-hidden /></button>
        <div className="hh-ctx-t">
          <strong>{title}</strong>
          {context && <span>{context}</span>}
        </div>
        {progress && <div className="hh-progress" aria-label={`Avance: ${progress[0]} de ${progress[1]}`}><strong>{progress[0]}</strong> de {progress[1]}</div>}
      </header>
      {progress && <div className="hh-bar"><i style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} /></div>}
      <main className="hh-body" aria-label={title}>{children}</main>
      {(primary || secondary) && (
        <footer className="hh-foot">
          {secondary && <div className="hh-secondary">{secondary}</div>}
          {primary}
        </footer>
      )}
    </div>
  );
}

export function Steps({ items, current }: { items: string[]; current: number }) {
  return (
    <ol className="hh-steps" aria-label="Pasos de la tarea">
      {items.map((s, i) => <li key={s} aria-current={i === current ? "step" : undefined} className={i < current ? "done" : i === current ? "now" : ""}>{s}</li>)}
    </ol>
  );
}
