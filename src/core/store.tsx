import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildSeed, SEED_VERSION } from "../data/seed";
import { applyAction, computeBalances, type Balance, type BalanceKey } from "./engine";
import type { Action, RoleId, State, User } from "./types";

const KEY = `wms.state.v${SEED_VERSION}`;

function load(): State {
  try {
    // Limpia estados de versiones anteriores del modelo
    Object.keys(localStorage).filter((k) => k.startsWith("wms.state.") && k !== KEY).forEach((k) => localStorage.removeItem(k));
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.version === SEED_VERSION) return { ...s, qc: s.qc ?? [] };
    }
  } catch { /* semilla nueva */ }
  return buildSeed();
}

interface Ctx {
  state: State;
  bal: Map<BalanceKey, Balance>;
  dispatch: (a: Action) => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);

  const dispatch = useCallback((a: Action) => {
    setState((prev) => (a.type === "RESET" ? buildSeed() : applyAction(prev, a)));
  }, []);

  // Persistir y sincronizar entre pestañas/iframes (consola ↔ handheld).
  useEffect(() => {
    const raw = JSON.stringify(state);
    if (localStorage.getItem(KEY) !== raw) localStorage.setItem(KEY, raw);
  }, [state]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) setState(JSON.parse(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const bal = useMemo(() => computeBalances(state), [state]);
  const value = useMemo(() => ({ state, bal, dispatch }), [state, bal, dispatch]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore fuera de StoreProvider");
  return c;
}

// Usuario activo por superficie (consola / handheld), recordado en el dispositivo.
export function useSessionUser(surface: "console" | "mobile", fallback?: string) {
  const k = `wms.session.${surface}`;
  const [id, setId] = useState<string | undefined>(() => localStorage.getItem(k) ?? fallback);
  const set = useCallback((v?: string) => {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
    setId(v);
  }, [k]);
  return [id, set] as const;
}

export const useUser = (id?: string): User | undefined => {
  const { state } = useStore();
  return state.users.find((u) => u.id === id);
};

// ---------- Permisos por rol ----------
export type Permission =
  | "wave.release" | "task.assign" | "count.create" | "count.approve" | "rules.edit"
  | "location.block" | "ship.confirm" | "receipt.close" | "dock.manage" | "rma.create" | "rma.credit" | "recall.manage" | "order.rework" | "quality.release" | "replenish.manage" | "po.create" | "data.reset";

const MATRIX: Record<Permission, RoleId[]> = {
  "wave.release": ["supervisor", "gerente"],
  "task.assign": ["supervisor", "gerente"],
  "count.create": ["supervisor", "gerente", "auditor"],
  "count.approve": ["supervisor", "gerente"],
  "rules.edit": ["admin", "gerente"],
  "location.block": ["admin", "supervisor"],
  "ship.confirm": ["supervisor", "empacador"],
  "receipt.close": ["supervisor", "admin"],
  "dock.manage": ["supervisor", "gerente"],
  "rma.create": ["supervisor", "gerente"],
  "rma.credit": ["gerente", "admin"],
  "recall.manage": ["gerente", "auditor"],
  "order.rework": ["supervisor", "gerente"],
  "quality.release": ["auditor", "gerente"],
  "replenish.manage": ["supervisor", "gerente"],
  "po.create": ["gerente", "admin"],
  "data.reset": ["admin", "gerente", "supervisor"],
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  "wave.release": "Liberar oleadas",
  "task.assign": "Reasignar tareas",
  "count.create": "Generar conteos",
  "count.approve": "Aprobar ajustes",
  "rules.edit": "Editar reglas",
  "location.block": "Bloquear ubicaciones",
  "ship.confirm": "Confirmar envíos",
  "receipt.close": "Cerrar recepciones",
  "dock.manage": "Gestionar andenes y patio",
  "rma.create": "Autorizar devoluciones (RMA)",
  "rma.credit": "Emitir nota de crédito",
  "recall.manage": "Iniciar y cerrar recalls",
  "order.rework": "Re-surtir pedidos retenidos",
  "quality.release": "Decidir sobre cuarentena y retenciones",
  "replenish.manage": "Generar reabasto de picking",
  "po.create": "Crear órdenes de compra",
  "data.reset": "Restablecer datos demo",
};

export const ROLE_LABEL: Record<RoleId, string> = {
  operario: "Operario de piso", empacador: "Empacador", supervisor: "Supervisor de turno",
  gerente: "Gerente de almacén", admin: "Administrador", auditor: "Auditor / calidad",
};

export const PERMISSIONS = Object.keys(MATRIX) as Permission[];
export const can = (role: RoleId | undefined, p: Permission) => !!role && MATRIX[p].includes(role);
export const whyNot = (p: Permission) =>
  `Requiere rol ${MATRIX[p].map((r) => ROLE_LABEL[r]).join(" o ")}`;
