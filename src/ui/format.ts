import type { DocStatus, OrderStage, TaskType, MovementType } from "../core/types";

const nf = new Intl.NumberFormat("es-MX");
export const num = (n: number) => nf.format(Math.round(n));
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)} %`;

export function ago(ts: number, now = Date.now()) {
  const m = Math.round((now - ts) / 60_000);
  if (Math.abs(m) < 1) return "ahora";
  const future = m < 0;
  const a = Math.abs(m);
  const txt = a < 60 ? `${a} min` : a < 60 * 24 ? `${Math.round(a / 60)} h` : `${Math.round(a / 1440)} d`;
  return future ? `en ${txt}` : `hace ${txt}`;
}

export const time = (ts: number) =>
  new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const dateTime = (ts: number) =>
  new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const date = (iso?: string) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const daysUntil = (iso: string, now = Date.now()) =>
  Math.ceil((new Date(iso + "T12:00:00").getTime() - now) / 86_400_000);

export type Tone = "pending" | "progress" | "blocked" | "done" | "warn" | "neutral" | "brand";

export const STATUS: Record<DocStatus | "por_aprobar", { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente", tone: "pending" },
  en_proceso: { label: "En proceso", tone: "progress" },
  bloqueado: { label: "Bloqueado", tone: "blocked" },
  completo: { label: "Completo", tone: "done" },
  por_aprobar: { label: "Por aprobar", tone: "warn" },
};

export const STAGE: Record<OrderStage, { label: string; tone: Tone; step: number }> = {
  nuevo: { label: "Nuevo", tone: "pending", step: 0 },
  liberado: { label: "Liberado", tone: "progress", step: 1 },
  en_picking: { label: "En picking", tone: "progress", step: 2 },
  surtido: { label: "Surtido", tone: "progress", step: 3 },
  empacado: { label: "Empacado", tone: "progress", step: 4 },
  enviado: { label: "Enviado", tone: "done", step: 5 },
};

export const TASK_LABEL: Record<TaskType, string> = {
  ubicar: "Ubicar", surtir: "Surtir", contar: "Contar", reabastecer: "Reabastecer", retirar: "Retirar",
};

export const MOVE_LABEL: Record<MovementType, string> = {
  recepcion: "Recepción", ubicacion: "Ubicación", surtido: "Surtido", empaque: "Empaque",
  envio: "Envío", ajuste: "Ajuste", transferencia: "Transferencia", devolucion: "Devolución", salida_calidad: "Salida por calidad",
};
