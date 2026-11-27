// Preferencias del handheld por operario. Se guardan en el dispositivo y se aplican al iniciar sesión:
// un equipo compartido entre turnos se adapta a quien lo usa (mano dominante, tamaño de letra, feedback).
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface HhPrefs {
  hand: "derecha" | "izquierda";
  text: "normal" | "grande" | "extra";
  sound: boolean;
  vibrate: boolean;
}

export const DEFAULT_PREFS: HhPrefs = { hand: "derecha", text: "normal", sound: true, vibrate: true };
// Demo: Sofía es zurda y ya lo tenía configurado en este dispositivo.
const SEEDED: Record<string, Partial<HhPrefs>> = { u3: { hand: "izquierda" } };

const key = (userId: string) => `wms.hh.prefs.${userId}`;

function load(userId?: string): HhPrefs {
  if (!userId) return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* preferencias por defecto */ }
  return { ...DEFAULT_PREFS, ...SEEDED[userId] };
}

export function usePrefsState(userId?: string) {
  const [prefs, setPrefs] = useState<HhPrefs>(() => load(userId));
  useEffect(() => setPrefs(load(userId)), [userId]);
  const set = useCallback((patch: Partial<HhPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (userId) localStorage.setItem(key(userId), JSON.stringify(next));
      return next;
    });
  }, [userId]);
  return { prefs, set };
}

const PrefsCtx = createContext<{ prefs: HhPrefs; set: (p: Partial<HhPrefs>) => void }>({ prefs: DEFAULT_PREFS, set: () => {} });
export const PrefsProvider = PrefsCtx.Provider;
export const usePrefs = () => useContext(PrefsCtx);

/** Clases del contenedor raíz según preferencias. */
export const prefsClass = (p: HhPrefs) => `hand-${p.hand === "izquierda" ? "left" : "right"} text-${p.text}`;
