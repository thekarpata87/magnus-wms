// Modelo de datos mínimo de un WMS (ver investigación, "Modelo de datos mínimo").
// Regla de oro: el saldo se DERIVA de los movimientos; nunca se edita a mano.

export type RoleId = "operario" | "empacador" | "supervisor" | "gerente" | "admin" | "auditor";

export interface User {
  id: string;
  name: string;
  role: RoleId;
  initials: string;
  shift: "Matutino" | "Vespertino" | "Nocturno";
}

export type LocationType = "recepcion" | "almacenaje" | "picking" | "staging" | "cuarentena" | "empaque" | "virtual";

export interface Location {
  code: string; // A-01-02-1  (zona-pasillo-rack-nivel)
  zone: string;
  aisle?: string;
  rack?: string;
  level?: string;
  type: LocationType;
  capacity: number; // unidades base
  blocked?: boolean;
}

export interface Product {
  sku: string;
  name: string;
  category: "Abarrotes" | "Bebidas" | "Higiene" | "Ferretería" | "Papelería" | "Electrónica";
  emoji: string; // "foto" del producto en el prototipo
  barcode: string; // EAN-13
  uom: string; // unidad base
  packs: { uom: string; factor: number }[]; // caja, tarima…
  weightKg: number;
  lotTracked: boolean;
  expiryTracked: boolean;
  abc: "A" | "B" | "C";
  min: number;
  max: number;
  preferredZone: string;
  pickFace?: string; // ubicación de picking asignada (nivel 1)
}

export interface Lot {
  code: string;
  sku: string;
  mfgDate?: string;
  expiryDate?: string;
  origin: string; // documento de recepción
  hold?: { reason: string; recall?: string; since: number }; // retenido: no se asigna ni se envía
}

export type MovementType = "recepcion" | "ubicacion" | "surtido" | "empaque" | "envio" | "ajuste" | "transferencia" | "devolucion" | "salida_calidad";

export interface Movement {
  id: string;
  ts: number;
  type: MovementType;
  sku: string;
  lot?: string;
  from: string; // código de ubicación o virtual (PROV, CLIENTE, AJUSTE)
  to: string;
  qty: number;
  user: string;
  device: "Handheld" | "Consola" | "Estación";
  doc?: string;
  note?: string;
}

export type DocStatus = "pendiente" | "en_proceso" | "bloqueado" | "completo";

export interface ReceiptLine {
  sku: string;
  expected: number;
  received: number;
  lot?: string;
  expiry?: string;
}

export interface Receipt {
  id: string; // OC-1042
  asn?: string;
  supplier: string;
  dock: string;
  appointment: number; // cita de andén
  arrivedAt?: number;
  completedAt?: number;
  status: DocStatus;
  lines: ReceiptLine[];
}

export interface OrderLine {
  sku: string;
  qty: number;
  picked: number;
  packed: number;
  short: number;
}

export type OrderStage = "nuevo" | "liberado" | "en_picking" | "surtido" | "empacado" | "enviado";

export interface Order {
  id: string;
  customer: string;
  channel: "Shopify" | "Amazon" | "Mercado Libre" | "B2B";
  carrier: "Estafeta" | "DHL" | "FedEx" | "99 Minutos";
  priority: "alta" | "normal";
  createdAt: number;
  due: number;
  releasedAt?: number;
  shippedAt?: number;
  stage: OrderStage;
  wave?: string;
  lines: OrderLine[];
  boxes?: { size: string; weightKg: number; tracking: string }[];
  exception?: string;
  hold?: string; // retenido por recall: no se puede cargar ni enviar
}

export interface Wave {
  id: string;
  createdAt: number;
  createdBy: string;
  orders: string[];
  criteria: string;
  status: DocStatus;
  mode?: PickMode;
}

export type TaskType = "ubicar" | "surtir" | "contar" | "reabastecer" | "retirar";

export interface PickStep {
  sku: string;
  lot?: string;
  from: string;
  qty: number;
  done: number;
  order: string;
  status: "pendiente" | "hecho" | "faltante" | "saltado";
}

export interface Task {
  id: string;
  type: TaskType;
  status: DocStatus;
  priority: number; // 1 = máxima
  assignee?: string;
  doc: string;
  createdAt: number;
  startedAt?: number;
  doneAt?: number;
  // ubicar
  sku?: string;
  lot?: string;
  qty?: number;
  from?: string;
  suggested?: string;
  // surtir
  steps?: PickStep[];
  // contar
  locations?: string[];
  exception?: string;
  orderRef?: string; // retirar: pedido del que se saca el lote retenido
  // surtir multi-pedido
  mode?: PickMode;
  zone?: string;
  cart?: string;
  totes?: { order: string; tote: string }[];
}

export type PickMode = "pedido" | "lote" | "zona";

export interface CountLine {
  location: string;
  sku?: string;
  lot?: string;
  expected: number;
  counted?: number;
}

export interface CycleCount {
  id: string;
  createdAt: number;
  reason: string; // ABC, diferencia, solicitado
  blind: boolean;
  status: DocStatus | "por_aprobar";
  task?: string;
  lines: CountLine[];
  approvedBy?: string;
}

export interface AuditEntry {
  id: string;
  ts: number;
  user: string;
  action: string;
  target: string;
  detail?: string;
}

// ---------- Gestión de andenes (Dock Management) ----------
export interface DockDoor {
  code: string; // AND-01
  kind: "entrada" | "salida";
  stage: string; // ubicación de piso que atiende (REC-01, STG-DHL…)
}

export type ApptStatus = "programada" | "en_patio" | "en_anden" | "completada" | "cancelada";

export interface Appointment {
  id: string; // CITA-301
  kind: "entrada" | "salida";
  party: string; // proveedor o transportista
  carrier?: Order["carrier"]; // salidas
  receipt?: string; // entradas: OC
  door?: string;
  start: number;
  durationMin: number;
  status: ApptStatus;
  plate?: string;
  arrivedAt?: number;
  dockedAt?: number;
  doneAt?: number;
  loaded?: string[]; // pedidos cargados (salida)
}

// ---------- Devoluciones (RMA) ----------
export type Condition = "buena" | "danada" | "defectuosa";
export type Disposition = "reubicar" | "cuarentena" | "desechar";

export interface RmaLine {
  sku: string;
  qty: number;
  received: number;
  lot?: string;
  condition?: Condition;
  disposition?: Disposition;
}

export interface Rma {
  id: string; // RMA-201
  order: string;
  customer: string;
  reason: string;
  createdAt: number;
  createdBy: string;
  status: DocStatus;
  lines: RmaLine[];
  receivedAt?: number;
  credit?: { amountLines: number; at: number; by: string };
}

// ---------- Cumplimiento ----------
export interface Recall {
  id: string; // RCL-301
  lot: string;
  sku: string;
  reason: string;
  severity: "I" | "II" | "III"; // Clase I = riesgo serio a la salud
  createdAt: number;
  createdBy: string;
  status: "abierto" | "cerrado";
  notified: string[]; // pedidos cuyos clientes fueron notificados
  closedAt?: number;
  disposition?: "destruir" | "devolver_proveedor";
}

export interface Sensor {
  id: string;
  name: string;
  zone: string;
  min: number;
  max: number;
  humMax: number;
  readings: { ts: number; t: number; h: number }[];
}

export interface Excursion {
  id: string;
  sensor: string;
  start: number;
  end: number;
  peak: number;
  reviewedBy?: string;
  note?: string;
}

// ---------- Calidad: decisiones sobre lo que está en cuarentena ----------
export type QcDecisionType = "liberar" | "proveedor" | "merma";
export interface QcDecision {
  id: string; // QC-301
  sku: string;
  lot?: string;
  qty: number;
  decision: QcDecisionType;
  note: string;
  origin?: string; // documento por el que entró a cuarentena
  by: string;
  at: number;
  task?: string; // liberar: tarea de ubicación generada
}

export interface Rules {
  removal: "FEFO" | "FIFO";
  putaway: "misma_ubicacion" | "zona_preferida" | "primera_libre";
  blindCount: boolean;
  autoReplenish: boolean;
  blockExpired: boolean;
}

export interface State {
  version: number;
  warehouse: { code: string; name: string };
  users: User[];
  products: Product[];
  locations: Location[];
  lots: Lot[];
  movements: Movement[];
  receipts: Receipt[];
  orders: Order[];
  waves: Wave[];
  tasks: Task[];
  counts: CycleCount[];
  audit: AuditEntry[];
  docks: DockDoor[];
  appointments: Appointment[];
  rmas: Rma[];
  recalls: Recall[];
  sensors: Sensor[];
  excursions: Excursion[];
  qc: QcDecision[];
  rules: Rules;
  seq: number;
  // Cola offline del handheld: acciones que esperan señal.
  offline: boolean;
  queue: Action[];
}

// Metadatos comunes: `at` permite sembrar historia; `device` decide si va a la cola offline.
export interface ActionMeta {
  at?: number;
  device?: Movement["device"];
}

// Acciones del dominio. Cada una se valida y genera movimientos en el reducer.
export type Action = ActionMeta & DomainAction;

export type DomainAction =
  | { type: "RECEIVE_LINE"; receipt: string; sku: string; qty: number; lot?: string; expiry?: string; user: string }
  | { type: "CLOSE_RECEIPT"; receipt: string; user: string }
  | { type: "START_TASK"; task: string; user: string }
  | { type: "CONFIRM_PUTAWAY"; task: string; to: string; user: string }
  | { type: "PICK_STEP"; task: string; index: number; qty: number; user: string }
  | { type: "PICK_EXCEPTION"; task: string; index: number; kind: "faltante" | "danado" | "saltar"; user: string }
  | { type: "PACK_ORDER"; order: string; box: string; weightKg: number; user: string }
  | { type: "SHIP_ORDERS"; orders: string[]; user: string }
  | { type: "RELEASE_WAVE"; orders: string[]; criteria: string; user: string; mode?: PickMode; batchSize?: number }
  | { type: "ASSIGN_TASK"; task: string; assignee: string; user: string }
  | { type: "SUBMIT_COUNT"; count: string; values: Record<string, number>; user: string }
  | { type: "APPROVE_COUNT"; count: string; user: string }
  | { type: "CREATE_COUNT"; locations: string[]; reason: string; user: string }
  | { type: "SET_RULES"; rules: Partial<Rules>; user: string }
  | { type: "TOGGLE_BLOCK_LOCATION"; code: string; user: string }
  | { type: "SCHEDULE_APPT"; kind: Appointment["kind"]; party: string; carrier?: Order["carrier"]; receipt?: string; door?: string; start: number; durationMin: number; user: string }
  | { type: "CHECK_IN"; appt: string; plate: string; user: string }
  | { type: "DOCK_APPT"; appt: string; door: string; user: string }
  | { type: "LOAD_ORDER"; appt: string; order: string; user: string }
  | { type: "COMPLETE_APPT"; appt: string; user: string }
  | { type: "CANCEL_APPT"; appt: string; user: string }
  | { type: "CREATE_RMA"; order: string; lines: { sku: string; qty: number }[]; reason: string; user: string }
  | { type: "RECEIVE_RETURN"; rma: string; sku: string; qty: number; condition: Condition; disposition: Disposition; user: string }
  | { type: "ISSUE_CREDIT"; rma: string; user: string }
  | { type: "START_RECALL"; lot: string; reason: string; severity: Recall["severity"]; user: string }
  | { type: "CONFIRM_WITHDRAW"; task: string; qty: number; user: string }
  | { type: "NOTIFY_RECALL"; recall: string; order: string; user: string }
  | { type: "CLOSE_RECALL"; recall: string; disposition: NonNullable<Recall["disposition"]>; user: string }
  | { type: "REWORK_ORDER"; order: string; user: string }
  | { type: "GENERATE_REPLENISH"; skus: string[]; user: string }
  | { type: "CONFIRM_REPLENISH"; task: string; qty: number; user: string }
  | { type: "CREATE_PO"; supplier: string; lines: { sku: string; qty: number }[]; user: string }
  | { type: "SIMULATE_ORDERS"; count: number; user: string }
  | { type: "QC_DECIDE"; sku: string; lot?: string; qty: number; decision: QcDecisionType; note: string; user: string }
  | { type: "HOLD_LOT"; lots: string[]; reason: string; user: string }
  | { type: "RELEASE_LOT"; lot: string; note: string; user: string }
  | { type: "REVIEW_EXCURSION"; excursion: string; note: string; user: string }
  | { type: "SET_OFFLINE"; offline: boolean }
  | { type: "RESET" };
