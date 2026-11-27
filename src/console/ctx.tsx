import { createContext, useContext } from "react";
import type { User } from "../core/types";

export type InspectTarget =
  | { kind: "producto"; id: string }
  | { kind: "ubicacion"; id: string }
  | { kind: "lote"; id: string }
  | { kind: "pedido"; id: string }
  | { kind: "recepcion"; id: string }
  | { kind: "tarea"; id: string }
  | { kind: "usuario"; id: string }
  | { kind: "rma"; id: string }
  | { kind: "cita"; id: string };

export interface ConsoleCtxValue {
  user: User;
  setUser: (id: string) => void;
  inspect: (t: InspectTarget) => void;
}

export const ConsoleCtx = createContext<ConsoleCtxValue | null>(null);
export function useConsole() {
  const c = useContext(ConsoleCtx);
  if (!c) throw new Error("useConsole fuera de la consola");
  return c;
}
