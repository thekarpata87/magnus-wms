// Núcleo WMS: saldos derivados, motor de reglas (putaway, FEFO/FIFO, ruta) y reducer.
// El reducer es el ÚNICO lugar que escribe movimientos (ver "Arquitectura técnica").

import { eanFromGtin, parseGs1 } from "./gs1";
import type {
  Action, AuditEntry, CountLine, Location, Movement, Order, PickMode, PickStep, Product, State, Task,
} from "./types";

export const VIRTUAL = new Set(["PROV", "CLIENTE", "AJUSTE"]);
export const PACK_LOC = "PACK-01";
export const STORAGE_TYPES = new Set<Location["type"]>(["almacenaje", "picking"]);

export const stagingFor = (carrier: Order["carrier"]) =>
  "STG-" + carrier.toUpperCase().replace(/\s+/g, "").replace("MINUTOS", "MIN");

// ---------- Saldos ----------
export type BalanceKey = string; // sku|loc|lot
export const bkey = (sku: string, loc: string, lot?: string) => `${sku}|${loc}|${lot ?? ""}`;

export interface Balance {
  sku: string;
  loc: string;
  lot?: string;
  qty: number;
  reserved: number; // comprometido para pedidos (surtidos abiertos)
  replen?: number;  // comprometido para reabasto interno: no reduce el disponible total, pero no se reasigna
}

export function computeBalances(state: Pick<State, "movements" | "tasks">): Map<BalanceKey, Balance> {
  const map = new Map<BalanceKey, Balance>();
  const touch = (sku: string, loc: string, lot: string | undefined, d: number) => {
    if (VIRTUAL.has(loc)) return;
    const k = bkey(sku, loc, lot);
    const b = map.get(k) ?? { sku, loc, lot, qty: 0, reserved: 0 };
    b.qty += d;
    map.set(k, b);
  };
  for (const m of state.movements) {
    touch(m.sku, m.from, m.lot, -m.qty);
    touch(m.sku, m.to, m.lot, m.qty);
  }
  // Reservado = pasos de surtido abiertos + reabastos en curso (su origen ya está comprometido)
  for (const t of state.tasks) {
    if (t.type === "reabastecer" && t.status !== "completo" && t.sku && t.from) {
      const b = map.get(bkey(t.sku, t.from, t.lot));
      if (b) b.replen = (b.replen ?? 0) + (t.qty ?? 0);
      continue;
    }
    if (t.type !== "surtir" || t.status === "completo") continue;
    for (const s of t.steps ?? []) {
      if (s.status !== "pendiente") continue;
      const b = map.get(bkey(s.sku, s.from, s.lot));
      if (b) b.reserved += s.qty - s.done;
    }
  }
  for (const [k, b] of map) if (b.qty === 0 && b.reserved === 0 && !b.replen) map.delete(k);
  return map;
}

export const balancesAt = (bal: Map<BalanceKey, Balance>, loc: string) =>
  [...bal.values()].filter((b) => b.loc === loc && b.qty !== 0);

export const balancesOf = (bal: Map<BalanceKey, Balance>, sku: string) =>
  [...bal.values()].filter((b) => b.sku === sku && b.qty !== 0);

export function locQty(bal: Map<BalanceKey, Balance>, loc: string) {
  let n = 0;
  for (const b of bal.values()) if (b.loc === loc) n += b.qty;
  return n;
}

export function skuTotals(state: State, bal = computeBalances(state)) {
  const storage = new Set(state.locations.filter((l) => STORAGE_TYPES.has(l.type)).map((l) => l.code));
  const out = new Map<string, { onHand: number; available: number; reserved: number; inProcess: number }>();
  for (const p of state.products) out.set(p.sku, { onHand: 0, available: 0, reserved: 0, inProcess: 0 });
  for (const b of bal.values()) {
    const t = out.get(b.sku);
    if (!t) continue;
    t.onHand += b.qty;
    if (storage.has(b.loc)) {
      t.reserved += b.reserved;
      t.available += b.qty - b.reserved;
    } else t.inProcess += b.qty;
  }
  return out;
}

// ---------- Motor de reglas ----------
export function suggestPutaway(state: State, sku: string, qty: number, exclude: string[] = []): string | undefined {
  const bal = computeBalances(state);
  const product = state.products.find((p) => p.sku === sku);
  const bins = state.locations
    .filter((l) => STORAGE_TYPES.has(l.type) && !l.blocked && !exclude.includes(l.code))
    .sort((a, b) => a.code.localeCompare(b.code));
  const free = (l: Location) => l.capacity - locQty(bal, l.code);
  const holdsSku = (l: Location) => balancesAt(bal, l.code).some((b) => b.sku === sku);
  const isEmpty = (l: Location) => locQty(bal, l.code) === 0;

  const strategies: ((l: Location) => boolean)[] = [];
  if (state.rules.putaway === "misma_ubicacion") strategies.push((l) => holdsSku(l) && free(l) >= qty);
  if (state.rules.putaway !== "primera_libre")
    strategies.push((l) => l.zone === product?.preferredZone && isEmpty(l) && free(l) >= qty);
  strategies.push((l) => isEmpty(l) && free(l) >= qty, (l) => free(l) >= qty);
  for (const s of strategies) {
    const hit = bins.find(s);
    if (hit) return hit.code;
  }
  return undefined;
}

export function routeKey(code: string) {
  // Ruta en serpentina: pasillos impares avanzan, pares regresan.
  const [zone, aisle = "00", rack = "00", level = "0"] = code.split("-");
  const a = parseInt(aisle, 10) || 0;
  const r = parseInt(rack, 10) || 0;
  const rr = a % 2 === 1 ? r : 99 - r;
  return `${zone}-${String(a).padStart(2, "0")}-${String(rr).padStart(2, "0")}-${level}`;
}

export function allocate(state: State, sku: string, qty: number, bal = computeBalances(state), locFilter?: (l: Location) => boolean) {
  const storage = new Map(state.locations.map((l) => [l.code, l]));
  const lotInfo = new Map(state.lots.map((l) => [l.code, l]));
  const firstIn = new Map<string, number>();
  for (const m of state.movements) {
    const k = bkey(m.sku, m.to, m.lot);
    if (!firstIn.has(k)) firstIn.set(k, m.ts);
  }
  const candidates = [...bal.values()]
    .filter((b) => {
      const l = storage.get(b.loc);
      const lot = lotInfo.get(b.lot ?? "");
      if (lot && !isLotUsable(state, lot)) return false;
      return b.sku === sku && l && STORAGE_TYPES.has(l.type) && !l.blocked && (!locFilter || locFilter(l)) && b.qty - b.reserved - (b.replen ?? 0) > 0;
    })
    .sort((a, b) => {
      if (state.rules.removal === "FEFO") {
        const ea = lotInfo.get(a.lot ?? "")?.expiryDate ?? "9999";
        const eb = lotInfo.get(b.lot ?? "")?.expiryDate ?? "9999";
        if (ea !== eb) return ea.localeCompare(eb);
      }
      return (firstIn.get(bkey(a.sku, a.loc, a.lot)) ?? 0) - (firstIn.get(bkey(b.sku, b.loc, b.lot)) ?? 0);
    });
  const picks: { loc: string; lot?: string; qty: number }[] = [];
  let left = qty;
  for (const c of candidates) {
    if (left <= 0) break;
    const take = Math.min(left, c.qty - c.reserved - (c.replen ?? 0));
    picks.push({ loc: c.loc, lot: c.lot, qty: take });
    c.reserved += take; // reserva temporal para asignaciones sucesivas en la misma oleada
    left -= take;
  }
  return { picks, short: Math.max(0, left) };
}

// ---------- Planeación de surtido: por pedido, por lote (carro con contenedores) o por zona ----------
const ZONE_X: Record<string, number> = { A: 0, B: 1, C: 2 };
const PACK_XY = { x: -12, y: 0 };
function coord(code: string) {
  const [z, a, r] = code.split("-");
  if (!(z in ZONE_X)) return PACK_XY;
  return { x: ZONE_X[z] * 30 + (parseInt(a, 10) - 1) * 10, y: parseInt(r, 10) * 4 };
}
/** Recorrido estimado en metros: sale de PACK-01, recorre pasillos (cambiar de pasillo obliga a volver al frente) y regresa. */
export function routeLength(locs: string[]) {
  let p = PACK_XY, d = 0;
  for (const loc of [...locs, "PACK-01"]) {
    const c = coord(loc);
    d += p.x === c.x ? Math.abs(p.y - c.y) : p.y + c.y + Math.abs(p.x - c.x);
    p = c;
  }
  return Math.round(d);
}
const stopsOf = (steps: PickStep[]) => steps.filter((st, i) => i === 0 || steps[i - 1].from !== st.from).map((st) => st.from);

export const taskOrders = (t: Task) => [...new Set((t.steps ?? []).map((st) => st.order))];
/** Nombre legible de una tarea de surtido según su modo. */
export function pickTaskLabel(t: Task) {
  const n = taskOrders(t).length;
  if (t.mode === "lote") return `Lote de ${n} pedido${n === 1 ? "" : "s"} · carro ${t.cart}`;
  if (t.mode === "zona") return `Zona ${t.zone} · ${n} pedido${n === 1 ? "" : "s"}`;
  return `Pedido ${t.doc}`;
}

export interface PickGroup { key: string; orders: string[]; steps: PickStep[]; zone?: string; priority: number }

export function planWave(state: State, orderIds: string[], mode: PickMode = "pedido", batchSize = 4, bal = computeBalances(state)) {
  const orders = orderIds.map((id) => state.orders.find((o) => o.id === id)).filter((o): o is Order => !!o && o.stage === "nuevo")
    .sort((a, b) => Number(b.priority === "alta") - Number(a.priority === "alta") || a.due - b.due);
  const perOrder = new Map<string, PickStep[]>();
  const shortages: { order: string; sku: string; short: number }[] = [];
  let lines = 0, units = 0;
  for (const o of orders) {
    const steps: PickStep[] = [];
    for (const l of o.lines) {
      lines++; units += l.qty;
      const r = allocate(state, l.sku, l.qty, bal);
      r.picks.forEach((p) => steps.push({ sku: l.sku, lot: p.lot, from: p.loc, qty: p.qty, done: 0, order: o.id, status: "pendiente" }));
      if (r.short) shortages.push({ order: o.id, sku: l.sku, short: r.short });
    }
    perOrder.set(o.id, steps);
  }
  const route = (st: PickStep[]) => st.sort((x, y) => routeKey(x.from).localeCompare(routeKey(y.from)) || x.order.localeCompare(y.order));
  const prio = (ids: string[]) => (ids.some((id) => state.orders.find((o) => o.id === id)?.priority === "alta") ? 1 : 3);
  let groups: PickGroup[] = [];
  if (mode === "pedido") groups = orders.map((o) => ({ key: o.id, orders: [o.id], steps: route(perOrder.get(o.id)!), priority: prio([o.id]) }));
  if (mode === "lote")
    for (let k = 0; k < orders.length; k += batchSize) {
      const ids = orders.slice(k, k + batchSize).map((o) => o.id);
      groups.push({ key: `L${k / batchSize + 1}`, orders: ids, steps: route(ids.flatMap((id) => perOrder.get(id)!)), priority: prio(ids) });
    }
  if (mode === "zona") {
    const byZone = new Map<string, PickStep[]>();
    for (const st of [...perOrder.values()].flat()) { const z = st.from.split("-")[0]; byZone.set(z, [...(byZone.get(z) ?? []), st]); }
    groups = [...byZone.entries()].sort().map(([z, st]) => { const ids = [...new Set(st.map((x) => x.order))]; return { key: z, zone: z, orders: ids, steps: route(st), priority: prio(ids) }; });
  }
  groups = groups.filter((g) => g.steps.length);
  const meters = groups.reduce((n, g) => n + routeLength(stopsOf(g.steps)), 0);
  const stops = groups.reduce((n, g) => n + stopsOf(g.steps).length, 0);
  return { groups, perOrder, shortages, lines, units, meters, stops, orders: orders.map((o) => o.id) };
}

export function previewWave(state: State, orderIds: string[], mode: PickMode = "pedido", batchSize = 4) {
  const operators = state.users.filter((u) => u.role === "operario");
  const plan = planWave(state, orderIds, mode, batchSize);
  const compare = (["pedido", "lote", "zona"] as PickMode[]).map((m) => {
    const p = m === mode ? plan : planWave(state, orderIds, m, batchSize);
    return { mode: m, tasks: p.groups.length, stops: p.stops, meters: p.meters };
  });
  const assignment = operators.map((u, i) => ({ user: u, tasks: plan.groups.filter((_, j) => j % operators.length === i).length }));
  return { tasks: plan.groups.length, lines: plan.lines, units: plan.units, stops: plan.stops, meters: plan.meters,
    shortLines: plan.shortages.length, shortages: plan.shortages, assignment, compare, groups: plan.groups };
}

// ---------- KPIs (calculados de movimientos y documentos) ----------
export function kpis(state: State, now = Date.now()) {
  const bal = computeBalances(state);
  const processed = state.orders.filter((o) => ["surtido", "empacado", "enviado"].includes(o.stage));
  const pickedLines = processed.flatMap((o) => o.lines);
  const pickAccuracy = pickedLines.length ? pickedLines.filter((l) => l.short === 0).length / pickedLines.length : 1;

  const countedLines = state.counts.filter((c) => c.status === "completo" || c.status === "por_aprobar").flatMap((c) => c.lines);
  const invAccuracy = countedLines.length
    ? countedLines.filter((l) => (l.counted ?? l.expected) === l.expected).length / countedLines.length
    : 1;

  const released = state.orders.filter((o) => o.stage !== "nuevo").flatMap((o) => o.lines);
  const stockout = released.length ? released.filter((l) => l.short > 0).length / released.length : 0;

  const shipped = state.orders.filter((o) => o.shippedAt && o.releasedAt);
  const fulfillHours = shipped.length
    ? shipped.reduce((s, o) => s + (o.shippedAt! - o.releasedAt!), 0) / shipped.length / 3_600_000
    : 0;

  const since = now - 8 * 3_600_000;
  const recentPicks = state.movements.filter((m) => m.type === "surtido" && m.ts >= since);
  const pickers = new Set(recentPicks.map((m) => m.user));
  const linesPerHour = pickers.size ? recentPicks.length / pickers.size / 8 : 0;

  const d2s: number[] = [];
  for (const r of state.receipts) {
    if (!r.arrivedAt) continue;
    const puts = state.movements.filter((m) => m.type === "ubicacion" && m.doc === r.id);
    if (puts.length && r.status === "completo") d2s.push(Math.max(...puts.map((m) => m.ts)) - r.arrivedAt);
  }
  const dockToStock = d2s.length ? d2s.reduce((a, b) => a + b, 0) / d2s.length / 3_600_000 : 0;

  const storage = state.locations.filter((l) => STORAGE_TYPES.has(l.type));
  const occupied = storage.filter((l) => locQty(bal, l.code) > 0).length;
  const occupancy = storage.length ? occupied / storage.length : 0;

  const waits = state.appointments.filter((x) => x.arrivedAt && x.dockedAt).map((x) => x.dockedAt! - x.arrivedAt!);
  const yardWaitMin = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length / 60_000 : 0;
  const shippedUnits = state.movements.filter((m) => m.type === "envio").reduce((n, m) => n + m.qty, 0);
  const returnedUnits = state.rmas.flatMap((r) => r.lines).reduce((n, l) => n + l.qty, 0);
  const returnRate = shippedUnits ? returnedUnits / shippedUnits : 0;

  return { pickAccuracy, invAccuracy, stockout, fulfillHours, linesPerHour, dockToStock, occupancy, occupied, storageCount: storage.length, yardWaitMin, returnRate };
}

export function alerts(state: State, now = Date.now()) {
  const bal = computeBalances(state);
  const totals = skuTotals(state, bal);
  const lowStock = state.products.filter((p) => (totals.get(p.sku)?.available ?? 0) < p.min);
  const soon = now + 30 * 86_400_000;
  const expiring = state.lots
    .filter((l) => l.expiryDate && new Date(l.expiryDate).getTime() < soon)
    .map((l) => ({ lot: l, qty: [...bal.values()].filter((b) => b.lot === l.code).reduce((s, b) => s + b.qty, 0) }))
    .filter((x) => x.qty > 0);
  const late = state.orders.filter((o) => o.stage !== "enviado" && o.due < now);
  const exceptions = state.orders.filter((o) => o.exception && o.stage !== "enviado");
  const approvals = state.counts.filter((c) => c.status === "por_aprobar");
  const yardWaiting = state.appointments.filter((x) => x.status === "en_patio" && x.arrivedAt && now - x.arrivedAt > 30 * 60_000);
  const creditPending = state.rmas.filter((r) => r.status === "en_proceso" && r.lines.every((l) => l.received >= l.qty));
  const openRecalls = state.recalls.filter((r) => r.status === "abierto");
  const unreviewed = state.excursions.filter((e) => !e.reviewedBy);
  return { lowStock, expiring, late, exceptions, approvals, yardWaiting, creditPending, openRecalls, unreviewed };
}

// ---------- Reducer ----------
const clone = <T,>(x: T): T => structuredClone(x);

function nextId(s: State, prefix: string) {
  s.seq += 1;
  return `${prefix}-${s.seq}`;
}

function log(s: State, ts: number, user: string, action: string, target: string, detail?: string) {
  const e: AuditEntry = { id: nextId(s, "AUD"), ts, user, action, target, detail };
  s.audit.unshift(e);
}

function move(s: State, m: Omit<Movement, "id">) {
  s.movements.push({ ...m, id: nextId(s, "MOV") });
}

function refreshOrderStages(s: State) {
  for (const o of s.orders) {
    if (!["liberado", "en_picking"].includes(o.stage)) continue;
    const steps = s.tasks.filter((t) => t.type === "surtir").flatMap((t) => t.steps ?? []).filter((st) => st.order === o.id);
    if (!steps.length) continue;
    if (steps.some((st) => st.status !== "pendiente")) o.stage = "en_picking";
    if (steps.every((st) => st.status !== "pendiente")) o.stage = "surtido";
  }
}

function refreshTask(t: Task, ts: number) {
  if (t.steps && t.steps.every((st) => st.status !== "pendiente")) {
    t.status = "completo";
    t.doneAt = ts;
  }
}

/** Saldo neto, por lote, de un pedido en una ubicación (entradas − salidas con doc = pedido). */
export function orderLotsAt(s: Pick<State, "movements">, order: string, loc: string, sku?: string) {
  const by = new Map<string, { sku: string; lot?: string; qty: number }>();
  for (const m of s.movements) {
    if (m.doc !== order || (sku && m.sku !== sku)) continue;
    const d = (m.to === loc ? m.qty : 0) - (m.from === loc ? m.qty : 0);
    if (!d) continue;
    const k = `${m.sku}|${m.lot ?? ""}`;
    const cur = by.get(k) ?? { sku: m.sku, lot: m.lot, qty: 0 };
    cur.qty += d;
    by.set(k, cur);
  }
  return [...by.values()].filter((x) => x.qty > 0);
}

export function applyAction(prev: State, a: Action): State {
  if (a.type === "RESET") return prev; // lo maneja el store
  if (a.type === "SET_OFFLINE") {
    const s = clone(prev);
    s.offline = a.offline;
    if (!a.offline && s.queue.length) {
      let out: State = { ...s, queue: [] };
      for (const q of s.queue) out = applyAction(out, q);
      return out;
    }
    return s;
  }
  // Handheld sin señal: se encola y se aplica al reconectar.
  if (prev.offline && a.device === "Handheld") {
    return { ...prev, queue: [...prev.queue, { ...a, at: a.at ?? Date.now() }] };
  }

  const s = clone(prev);
  const ts = a.at ?? Date.now();
  const device = a.device ?? "Consola";

  switch (a.type) {
    case "RECEIVE_LINE": {
      const r = s.receipts.find((x) => x.id === a.receipt);
      const line = r?.lines.find((l) => l.sku === a.sku);
      if (!r || !line || a.qty <= 0) return prev;
      if (a.lot && !s.lots.some((l) => l.code === a.lot)) {
        s.lots.push({ code: a.lot, sku: a.sku, expiryDate: a.expiry, mfgDate: new Date(ts).toISOString().slice(0, 10), origin: r.id });
      }
      line.received += a.qty;
      line.lot = a.lot;
      line.expiry = a.expiry;
      r.status = "en_proceso";
      r.arrivedAt ??= ts;
      move(s, { ts, type: "recepcion", sku: a.sku, lot: a.lot, from: "PROV", to: r.dock, qty: a.qty, user: a.user, device, doc: r.id });
      s.tasks.push({
        id: nextId(s, "TSK"), type: "ubicar", status: "pendiente", priority: 2, doc: r.id, createdAt: ts,
        sku: a.sku, lot: a.lot, qty: a.qty, from: r.dock, suggested: suggestPutaway(s, a.sku, a.qty),
      });
      return s;
    }
    case "CLOSE_RECEIPT": {
      const r = s.receipts.find((x) => x.id === a.receipt);
      if (!r) return prev;
      r.status = "completo";
      r.completedAt = ts;
      const diff = r.lines.filter((l) => l.received !== l.expected);
      log(s, ts, a.user, "Cerró recepción", r.id, diff.length ? `${diff.length} línea(s) con diferencia vs OC` : "Sin diferencias");
      return s;
    }
    case "START_TASK": {
      const t = s.tasks.find((x) => x.id === a.task);
      if (!t || t.status === "completo") return prev;
      t.status = "en_proceso";
      t.assignee ??= a.user;
      t.startedAt ??= ts;
      return s;
    }
    case "ASSIGN_TASK": {
      const t = s.tasks.find((x) => x.id === a.task);
      if (!t) return prev;
      t.assignee = a.assignee;
      log(s, ts, a.user, "Reasignó tarea", t.id, `a ${s.users.find((u) => u.id === a.assignee)?.name}`);
      return s;
    }
    case "CONFIRM_PUTAWAY": {
      const t = s.tasks.find((x) => x.id === a.task);
      if (!t || t.type !== "ubicar" || t.status === "completo" || !t.sku || !t.qty || !t.from) return prev;
      move(s, { ts, type: "ubicacion", sku: t.sku, lot: t.lot, from: t.from, to: a.to, qty: t.qty, user: a.user, device, doc: t.doc,
        note: a.to !== t.suggested ? `Sugerida ${t.suggested}` : undefined });
      t.status = "completo";
      t.assignee ??= a.user;
      t.doneAt = ts;
      return s;
    }
    case "PICK_STEP": {
      const t = s.tasks.find((x) => x.id === a.task);
      const st = t?.steps?.[a.index];
      if (!t || !st || st.status !== "pendiente") return prev;
      const qty = Math.min(a.qty, st.qty - st.done);
      st.done += qty;
      if (st.done >= st.qty) st.status = "hecho";
      move(s, { ts, type: "surtido", sku: st.sku, lot: st.lot, from: st.from, to: PACK_LOC, qty, user: a.user, device, doc: st.order });
      const o = s.orders.find((x) => x.id === st.order);
      const ol = o?.lines.find((l) => l.sku === st.sku);
      if (ol) ol.picked += qty;
      t.status = "en_proceso";
      t.startedAt ??= ts;
      refreshTask(t, ts);
      refreshOrderStages(s);
      if (s.rules.autoReplenish) genReplenish(s, [st.sku], ts, a.user, true);
      return s;
    }
    case "PICK_EXCEPTION": {
      const t = s.tasks.find((x) => x.id === a.task);
      const st = t?.steps?.[a.index];
      if (!t || !t.steps || !st || st.status !== "pendiente") return prev;
      if (a.kind === "saltar") {
        t.steps.splice(a.index, 1);
        t.steps.push(st);
        return s;
      }
      const missing = st.qty - st.done;
      st.status = "faltante";
      const o = s.orders.find((x) => x.id === st.order);
      const ol = o?.lines.find((l) => l.sku === st.sku);
      if (ol) ol.short += missing;
      if (o) o.exception = `${a.kind === "danado" ? "Dañado" : "Faltante"}: ${missing} × ${st.sku} en ${st.from}`;
      // Buena práctica: un faltante dispara un conteo de esa ubicación.
      createCount(s, ts, [st.from], `Excepción de surtido (${a.kind})`, a.user);
      log(s, ts, a.user, a.kind === "danado" ? "Reportó dañado" : "Reportó faltante", st.order, `${missing} × ${st.sku} en ${st.from}`);
      refreshTask(t, ts);
      refreshOrderStages(s);
      return s;
    }
    case "PACK_ORDER": {
      const o = s.orders.find((x) => x.id === a.order);
      if (!o || o.stage !== "surtido" || o.hold || pendingWithdraw(s, o.id)) return prev;
      const stg = stagingFor(o.carrier);
      for (const l of o.lines) {
        for (const part of orderLotsAt(s, o.id, PACK_LOC, l.sku)) {
          move(s, { ts, type: "empaque", sku: l.sku, lot: part.lot, from: PACK_LOC, to: stg, qty: part.qty, user: a.user, device, doc: o.id });
        }
        l.packed = l.picked;
      }
      const prefix = { Estafeta: "EST", DHL: "DHL", FedEx: "FDX", "99 Minutos": "99M" }[o.carrier];
      o.boxes = [...(o.boxes ?? []), { size: a.box, weightKg: a.weightKg, tracking: `${prefix}${String(ts).slice(-9)}` }];
      o.stage = "empacado";
      return s;
    }
    case "SHIP_ORDERS": {
      for (const id of a.orders) shipOrder(s, id, ts, a.user, device);
      log(s, ts, a.user, "Confirmó carga y envío", a.orders.join(", "));
      return s;
    }
    // ---------- Andenes ----------
    case "SCHEDULE_APPT": {
      const id = nextId(s, "CITA");
      s.appointments.push({ id, kind: a.kind, party: a.party, carrier: a.carrier, receipt: a.receipt, door: a.door, start: a.start, durationMin: a.durationMin, status: "programada" });
      const r = a.receipt && s.receipts.find((x) => x.id === a.receipt);
      if (r) r.appointment = a.start;
      log(s, ts, a.user, "Programó cita de andén", id, `${a.party} · ${a.door ?? "sin puerta"}`);
      return s;
    }
    case "CHECK_IN": {
      const ap = s.appointments.find((x) => x.id === a.appt);
      if (!ap || ap.status !== "programada") return prev;
      ap.status = "en_patio";
      ap.plate = a.plate;
      ap.arrivedAt = ts;
      log(s, ts, a.user, "Registró llegada a patio", ap.id, `${ap.party} · placas ${a.plate}`);
      return s;
    }
    case "DOCK_APPT": {
      const ap = s.appointments.find((x) => x.id === a.appt);
      if (!ap || !["programada", "en_patio"].includes(ap.status) || doorBusy(s, a.door, ap.id)) return prev;
      ap.arrivedAt ??= ts;
      ap.status = "en_anden";
      ap.door = a.door;
      ap.dockedAt = ts;
      const r = ap.receipt && s.receipts.find((x) => x.id === ap.receipt);
      if (r) r.arrivedAt ??= ts;
      log(s, ts, a.user, "Asignó andén", ap.id, `${ap.party} → ${a.door}`);
      return s;
    }
    case "LOAD_ORDER": {
      const ap = s.appointments.find((x) => x.id === a.appt);
      const o = s.orders.find((x) => x.id === a.order);
      if (!ap || ap.kind !== "salida" || ap.status !== "en_anden" || !o || o.stage !== "empacado" || o.hold || o.carrier !== ap.carrier) return prev;
      shipOrder(s, o.id, ts, a.user, device);
      ap.loaded = [...(ap.loaded ?? []), o.id];
      return s;
    }
    case "COMPLETE_APPT": {
      const ap = s.appointments.find((x) => x.id === a.appt);
      if (!ap || ap.status !== "en_anden") return prev;
      ap.status = "completada";
      ap.doneAt = ts;
      log(s, ts, a.user, ap.kind === "salida" ? "Despachó unidad" : "Liberó andén", ap.id,
        ap.kind === "salida" ? `${ap.loaded?.length ?? 0} pedido(s) cargados` : ap.receipt);
      return s;
    }
    case "CANCEL_APPT": {
      const ap = s.appointments.find((x) => x.id === a.appt);
      if (!ap || ap.status === "completada") return prev;
      ap.status = "cancelada";
      log(s, ts, a.user, "Canceló cita", ap.id, ap.party);
      return s;
    }
    // ---------- Devoluciones ----------
    case "CREATE_RMA": {
      const o = s.orders.find((x) => x.id === a.order);
      if (!o || o.stage !== "enviado") return prev;
      const lines = a.lines.filter((l) => l.qty > 0 && l.qty <= returnable(s, o.id, l.sku)).map((l) => ({
        sku: l.sku, qty: l.qty, received: 0,
        lot: s.movements.find((m) => m.doc === o.id && m.type === "envio" && m.sku === l.sku)?.lot,
      }));
      if (!lines.length) return prev;
      const id = nextId(s, "RMA");
      s.rmas.unshift({ id, order: o.id, customer: o.customer, reason: a.reason, createdAt: ts, createdBy: a.user, status: "pendiente", lines });
      log(s, ts, a.user, "Autorizó devolución", id, `${o.id} · ${a.reason}`);
      return s;
    }
    case "RECEIVE_RETURN": {
      const r = s.rmas.find((x) => x.id === a.rma);
      const l = r?.lines.find((x) => x.sku === a.sku);
      if (!r || !l || r.status === "completo" || a.qty <= 0 || l.received + a.qty > l.qty) return prev;
      // Un lote retenido por recall nunca vuelve a stock
      const disposition = a.disposition === "reubicar" && s.lots.find((x) => x.code === l.lot)?.hold ? "cuarentena" : a.disposition;
      const to = disposition === "reubicar" ? RETURN_DOCK : disposition === "cuarentena" ? "QUA-01" : "AJUSTE";
      move(s, { ts, type: "devolucion", sku: a.sku, lot: l.lot, from: "CLIENTE", to, qty: a.qty, user: a.user, device, doc: r.id,
        note: disposition === "desechar" ? "Desecho por devolución" : `Condición: ${a.condition}` });
      if (disposition === "reubicar")
        s.tasks.push({ id: nextId(s, "TSK"), type: "ubicar", status: "pendiente", priority: 3, doc: r.id, createdAt: ts,
          sku: a.sku, lot: l.lot, qty: a.qty, from: RETURN_DOCK, suggested: suggestPutaway(s, a.sku, a.qty) });
      l.received += a.qty;
      l.condition = a.condition;
      l.disposition = disposition;
      r.status = "en_proceso";
      r.receivedAt ??= ts;
      return s;
    }
    case "ISSUE_CREDIT": {
      const r = s.rmas.find((x) => x.id === a.rma);
      if (!r || r.status !== "en_proceso" || r.lines.some((l) => l.received < l.qty)) return prev;
      r.status = "completo";
      r.credit = { amountLines: r.lines.length, at: ts, by: a.user };
      log(s, ts, a.user, "Emitió nota de crédito", r.id, `${r.order} · ${r.customer}`);
      return s;
    }
    case "RELEASE_WAVE": {
      const ops = s.users.filter((u) => u.role === "operario");
      const mode = a.mode ?? "pedido";
      const waveId = nextId(s, "OLA");
      const plan = planWave(s, a.orders, mode, a.batchSize ?? 4);
      for (const oid of plan.orders) {
        const o = s.orders.find((x) => x.id === oid)!;
        const sh = plan.shortages.filter((x) => x.order === oid);
        for (const x of sh) { const l = o.lines.find((y) => y.sku === x.sku); if (l) l.short += x.short; }
        o.stage = plan.perOrder.get(oid)!.length ? "liberado" : "surtido";
        o.wave = waveId;
        o.releasedAt = ts;
        if (sh.length) o.exception = `Sin existencia: ${sh.map((x) => `${x.short} × ${x.sku}`).join(", ")}`;
      }
      plan.groups.forEach((g, i) => {
        const id = nextId(s, "TSK");
        const cart = mode === "pedido" ? undefined : `C${(Number(id.replace(/\D/g, "")) % 30) + 1}`;
        s.tasks.push({
          id, type: "surtir", status: "pendiente", priority: g.priority, assignee: ops.length ? ops[i % ops.length].id : undefined,
          doc: mode === "pedido" ? g.orders[0] : `${waveId}·${g.key}`, createdAt: ts, steps: g.steps, mode, zone: g.zone, cart,
          totes: cart ? g.orders.map((o, k) => ({ order: o, tote: `${cart}-${k + 1}` })) : undefined,
        });
      });
      s.waves.unshift({ id: waveId, createdAt: ts, createdBy: a.user, orders: a.orders, criteria: a.criteria, status: "en_proceso", mode });
      log(s, ts, a.user, "Liberó oleada", waveId, `${a.orders.length} pedidos · ${a.criteria} · surtido por ${mode} (${plan.groups.length} tareas, ~${plan.meters} m)`);
      if (s.rules.autoReplenish) genReplenish(s, [...new Set(a.orders.flatMap((id) => s.orders.find((o) => o.id === id)?.lines.map((l) => l.sku) ?? []))], ts, a.user, true);
      return s;
    }
    case "CREATE_COUNT": {
      createCount(s, ts, a.locations, a.reason, a.user);
      return s;
    }
    case "SUBMIT_COUNT": {
      const c = s.counts.find((x) => x.id === a.count);
      if (!c) return prev;
      c.lines.forEach((l, i) => {
        if (a.values[i] !== undefined) l.counted = a.values[i];
      });
      c.status = c.lines.some((l) => (l.counted ?? 0) !== l.expected) ? "por_aprobar" : "completo";
      const t = s.tasks.find((x) => x.id === c.task);
      if (t) {
        t.status = "completo";
        t.doneAt = ts;
        t.assignee ??= a.user;
      }
      log(s, ts, a.user, "Registró conteo", c.id, c.status === "por_aprobar" ? "Con diferencias, requiere aprobación" : "Sin diferencias");
      return s;
    }
    case "APPROVE_COUNT": {
      const c = s.counts.find((x) => x.id === a.count);
      if (!c || c.status !== "por_aprobar") return prev;
      for (const l of c.lines) {
        const d = (l.counted ?? 0) - l.expected;
        if (!d || !l.sku) continue;
        move(s, { ts, type: "ajuste", sku: l.sku, lot: l.lot, from: d > 0 ? "AJUSTE" : l.location, to: d > 0 ? l.location : "AJUSTE",
          qty: Math.abs(d), user: a.user, device, doc: c.id, note: "Ajuste por conteo aprobado" });
      }
      c.status = "completo";
      c.approvedBy = a.user;
      log(s, ts, a.user, "Aprobó ajuste de inventario", c.id);
      return s;
    }
    // ---------- Cumplimiento ----------
    case "START_RECALL": {
      const lot = s.lots.find((l) => l.code === a.lot);
      if (!lot || lot.hold?.recall) return prev;
      const id = nextId(s, "RCL");
      lot.hold = { reason: a.reason, recall: id, since: ts };
      s.recalls.unshift({ id, lot: lot.code, sku: lot.sku, reason: a.reason, severity: a.severity, createdAt: ts, createdBy: a.user, status: "abierto", notified: [] });
      // 1) Retirar a cuarentena todo lo que está en almacén
      const bal = computeBalances(s);
      for (const b of bal.values()) {
        if (b.lot !== lot.code || b.qty <= 0 || b.loc === "QUA-01") continue;
        const loc = s.locations.find((l) => l.code === b.loc);
        if (!loc || !["almacenaje", "picking", "recepcion"].includes(loc.type)) continue;
        s.tasks.push({ id: nextId(s, "TSK"), type: "retirar", status: "pendiente", priority: 1, doc: id, createdAt: ts,
          sku: lot.sku, lot: lot.code, qty: b.qty, from: b.loc, suggested: "QUA-01" });
      }
      // 2) Cancelar surtidos pendientes de ese lote
      for (const t of s.tasks) {
        if (t.type !== "surtir" || t.status === "completo") continue;
        for (const st of t.steps ?? []) {
          if (st.lot !== lot.code || st.status !== "pendiente") continue;
          st.status = "faltante";
          const o = s.orders.find((x) => x.id === st.order);
          const ol = o?.lines.find((l) => l.sku === st.sku);
          if (ol) ol.short += st.qty - st.done;
          if (o) o.exception = `Lote ${lot.code} en recall: reasignar ${st.qty - st.done} × ${st.sku}`;
        }
        refreshTask(t, ts);
      }
      refreshOrderStages(s);
      // 3) Retener pedidos ya surtidos/empacados que contienen el lote
      const touched = new Set(s.movements.filter((m) => m.lot === lot.code && m.type === "surtido" && m.doc).map((m) => m.doc!));
      for (const o of s.orders)
        if (touched.has(o.id) && o.stage !== "enviado") { o.hold = `Recall ${id} · lote ${lot.code}`; o.exception = `Retenido por recall (${lot.code})`; }
      log(s, ts, a.user, "Inició recall", id, `Lote ${lot.code} · Clase ${a.severity} · ${a.reason}`);
      return s;
    }
    case "CONFIRM_WITHDRAW": {
      const t = s.tasks.find((x) => x.id === a.task);
      if (!t || t.type !== "retirar" || t.status === "completo" || !t.sku || !t.from) return prev;
      const qty = Math.max(0, Math.min(a.qty, t.qty ?? 0));
      if (qty) move(s, { ts, type: "transferencia", sku: t.sku, lot: t.lot, from: t.from, to: "QUA-01", qty, user: a.user, device, doc: t.orderRef ?? t.doc,
        note: t.orderRef ? `Retiro por recall ${t.doc} (desempaque)` : "Retiro por recall" });
      // Recall ya cerrado: lo que llega tarde a cuarentena recibe la misma disposición
      const rc = s.recalls.find((r) => r.id === t.doc && r.status === "cerrado");
      if (qty && rc?.disposition)
        move(s, { ts, type: "ajuste", sku: t.sku, lot: t.lot, from: "QUA-01", to: rc.disposition === "destruir" ? "AJUSTE" : "PROV", qty, user: a.user, device, doc: rc.id,
          note: "Disposición posterior al cierre del recall" });
      t.status = "completo";
      t.doneAt = ts;
      t.assignee ??= a.user;
      if (qty < (t.qty ?? 0)) log(s, ts, a.user, "Retiro parcial", t.doc, `${t.from}: ${qty} de ${t.qty}`);
      return s;
    }
    case "NOTIFY_RECALL": {
      const r = s.recalls.find((x) => x.id === a.recall);
      const o = s.orders.find((x) => x.id === a.order);
      if (!r || !o || r.notified.includes(o.id)) return prev;
      r.notified.push(o.id);
      const qty = s.movements.filter((m) => m.doc === o.id && m.type === "envio" && m.lot === r.lot).reduce((n, m) => n + m.qty, 0);
      if (qty > 0) {
        const id = nextId(s, "RMA");
        s.rmas.unshift({ id, order: o.id, customer: o.customer, reason: `Recall ${r.id} (lote ${r.lot})`, createdAt: ts, createdBy: a.user,
          status: "pendiente", lines: [{ sku: r.sku, qty, received: 0, lot: r.lot }] });
      }
      log(s, ts, a.user, "Notificó recall a cliente", r.id, `${o.customer} · ${o.id} · ${qty} pzas`);
      return s;
    }
    case "CLOSE_RECALL": {
      const r = s.recalls.find((x) => x.id === a.recall);
      if (!r || r.status !== "abierto") return prev;
      if (s.orders.some((o) => o.hold?.includes(r.id)) || s.tasks.some((t) => t.type === "retirar" && t.doc === r.id && t.status !== "completo")) return prev;
      const qua = balancesAt(computeBalances(s), "QUA-01").filter((b) => b.lot === r.lot);
      for (const b of qua)
        move(s, { ts, type: "ajuste", sku: b.sku, lot: b.lot, from: "QUA-01", to: a.disposition === "destruir" ? "AJUSTE" : "PROV", qty: b.qty, user: a.user, device, doc: r.id,
          note: a.disposition === "destruir" ? "Destrucción certificada por recall" : "Devuelto al proveedor por recall" });
      r.status = "cerrado";
      r.closedAt = ts;
      r.disposition = a.disposition;
      log(s, ts, a.user, "Cerró recall", r.id, `${a.disposition === "destruir" ? "Destrucción" : "Devolución a proveedor"} de ${qua.reduce((n, b) => n + b.qty, 0)} pzas`);
      return s;
    }
    case "REWORK_ORDER": {
      const o = s.orders.find((x) => x.id === a.order);
      if (!o || !needsRework(o)) return prev;
      const plan = reworkPlan(s, o.id)!;
      const recallId = (lot?: string) => s.lots.find((l) => l.code === lot)?.hold?.recall ?? "RETENIDO";
      // 1) Desempacar: lo que sirve regresa de staging a la mesa de empaque; las guías se anulan
      if (plan.unpack) {
        for (const part of orderLotsAt(s, o.id, plan.stg))
          if (!plan.lines.some((l) => l.held.some((h) => h.lot === part.lot && h.sku === part.sku)))
            move(s, { ts, type: "transferencia", sku: part.sku, lot: part.lot, from: plan.stg, to: PACK_LOC, qty: part.qty, user: a.user, device, doc: o.id, note: "Desempaque por recall" });
        if (plan.boxes.length) log(s, ts, a.user, "Anuló guía", o.id, plan.boxes.map((b) => b.tracking).join(", "));
        o.boxes = [];
      }
      // 2) Retirar lo retenido a cuarentena (tarea urgente en handheld)
      for (const l of plan.lines)
        for (const h of l.held)
          s.tasks.push({ id: nextId(s, "TSK"), type: "retirar", status: "pendiente", priority: 1, doc: recallId(h.lot), orderRef: o.id, createdAt: ts,
            sku: h.sku, lot: h.lot, qty: h.qty, from: h.loc, suggested: "QUA-01" });
      // 3) Reponer con lotes liberados (FEFO/FIFO), ruta en serpentina
      const steps: PickStep[] = plan.lines.flatMap((l) => l.picks.map((p) => ({ sku: l.sku, lot: p.lot, from: p.loc, qty: p.qty, done: 0, order: o.id, status: "pendiente" as const })));
      steps.sort((x, y) => routeKey(x.from).localeCompare(routeKey(y.from)));
      const op = s.users.find((u) => u.role === "operario");
      if (steps.length)
        s.tasks.push({ id: nextId(s, "TSK"), type: "surtir", status: "pendiente", priority: 1, assignee: op?.id, doc: o.id, createdAt: ts, steps });
      // 4) Contadores y estado
      for (const l of o.lines) {
        const p = plan.lines.find((x) => x.sku === l.sku)!;
        l.picked = p.good;
        l.packed = 0;
        l.short = p.short;
      }
      o.hold = undefined;
      o.stage = steps.length ? "en_picking" : "surtido";
      o.exception = plan.shortUnits ? `Re-surtido incompleto: faltan ${plan.shortUnits} pzas sin lote liberado` : undefined;
      log(s, ts, a.user, "Re-surtió pedido retenido", o.id,
        `${plan.heldUnits} pzas a cuarentena · ${plan.replaceUnits} repuestas${plan.shortUnits ? ` · ${plan.shortUnits} sin existencia` : ""}`);
      return s;
    }
    case "GENERATE_REPLENISH": {
      const n = genReplenish(s, a.skus, ts, a.user, false);
      return n ? s : prev;
    }
    case "CONFIRM_REPLENISH": {
      const t = s.tasks.find((x) => x.id === a.task);
      if (!t || t.type !== "reabastecer" || t.status === "completo" || !t.sku || !t.from || !t.suggested) return prev;
      const qty = Math.max(0, Math.min(a.qty, t.qty ?? 0));
      if (qty) move(s, { ts, type: "transferencia", sku: t.sku, lot: t.lot, from: t.from, to: t.suggested, qty, user: a.user, device, doc: t.id, note: "Reabasto de picking" });
      t.status = "completo";
      t.doneAt = ts;
      t.assignee ??= a.user;
      if (qty < (t.qty ?? 0)) log(s, ts, a.user, "Reabasto parcial", t.id, `${t.from}: ${qty} de ${t.qty}`);
      return s;
    }
    case "CREATE_PO": {
      const lines = a.lines.filter((l) => l.qty > 0);
      if (!lines.length) return prev;
      const n = Math.max(1043, ...s.receipts.map((r) => Number(r.id.replace(/\D/g, "")) || 0)) + 1;
      const id = `OC-${n}`;
      s.receipts.push({ id, supplier: a.supplier, dock: "REC-01", appointment: ts + 2 * 86_400_000, status: "pendiente",
        lines: lines.map((l) => ({ sku: l.sku, expected: l.qty, received: 0 })) });
      log(s, ts, a.user, "Creó orden de compra", id, `${a.supplier} · ${lines.map((l) => `${l.qty} × ${l.sku}`).join(", ")}`);
      return s;
    }
    case "QC_DECIDE": {
      const item = quarantineItems(s, computeBalances(s), ts).find((x) => x.sku === a.sku && (x.lot ?? "") === (a.lot ?? ""));
      if (!item || a.qty <= 0 || a.qty > item.qty || a.note.trim().length < 10) return prev;
      if (a.decision === "liberar" && item.releaseBlock) return prev;
      const id = nextId(s, "QC");
      const dec: State["qc"][number] = { id, sku: a.sku, lot: a.lot, qty: a.qty, decision: a.decision, note: a.note.trim(), origin: item.doc, by: a.user, at: ts };
      if (a.decision === "liberar") {
        const tid = nextId(s, "TSK");
        s.tasks.push({ id: tid, type: "ubicar", status: "pendiente", priority: 2, doc: id, createdAt: ts, sku: a.sku, lot: a.lot, qty: a.qty, from: QUA, suggested: suggestPutaway(s, a.sku, a.qty) });
        dec.task = tid;
      } else {
        move(s, { ts, type: "salida_calidad", sku: a.sku, lot: a.lot, from: QUA, to: a.decision === "proveedor" ? "PROV" : "AJUSTE", qty: a.qty, user: a.user, device, doc: id,
          note: a.decision === "proveedor" ? "Devolución a proveedor (RTV)" : "Merma por calidad" });
      }
      s.qc.unshift(dec);
      log(s, ts, a.user, a.decision === "liberar" ? "Liberó de cuarentena" : a.decision === "proveedor" ? "Devolvió a proveedor" : "Dio de baja por calidad", id,
        `${a.qty} × ${a.sku}${a.lot ? ` (${a.lot})` : ""} · ${a.note.trim()}`);
      return s;
    }
    case "HOLD_LOT": {
      const held: string[] = [];
      for (const code of a.lots) {
        const l = s.lots.find((x) => x.code === code);
        if (!l || l.hold) continue;
        l.hold = { reason: a.reason, since: ts };
        held.push(code);
      }
      if (!held.length) return prev;
      log(s, ts, a.user, "Retuvo por calidad", held.join(", "), a.reason);
      return s;
    }
    case "RELEASE_LOT": {
      const l = s.lots.find((x) => x.code === a.lot);
      if (!l?.hold || l.hold.recall || a.note.trim().length < 10) return prev;
      l.hold = undefined;
      log(s, ts, a.user, "Liberó lote retenido", l.code, a.note.trim());
      return s;
    }
    case "REVIEW_EXCURSION": {
      const e = s.excursions.find((x) => x.id === a.excursion);
      if (!e || e.reviewedBy) return prev;
      e.reviewedBy = a.user;
      e.note = a.note;
      log(s, ts, a.user, "Evaluó excursión de temperatura", e.id, a.note);
      return s;
    }
    case "SET_RULES": {
      s.rules = { ...s.rules, ...a.rules };
      log(s, ts, a.user, "Cambió reglas", "Motor de reglas", JSON.stringify(a.rules).replace(/["{}]/g, ""));
      return s;
    }
    case "TOGGLE_BLOCK_LOCATION": {
      const l = s.locations.find((x) => x.code === a.code);
      if (!l) return prev;
      l.blocked = !l.blocked;
      log(s, ts, a.user, l.blocked ? "Bloqueó ubicación" : "Desbloqueó ubicación", l.code);
      return s;
    }
  }
  return prev;
}

export const RETURN_DOCK = "REC-02";

const today = () => new Date().toISOString().slice(0, 10);
export function isLotUsable(state: State, lot: State["lots"][number]) {
  if (lot.hold) return false;
  if (state.rules.blockExpired && lot.expiryDate && lot.expiryDate < today()) return false;
  return true;
}

// ---------- Reabasto min/max ----------
/** Ubicación de picking del SKU: la asignada o el bin de nivel 1 donde se cargó al inicio. */
export const pickFaceLoc = (state: State, sku: string) =>
  state.products.find((p) => p.sku === sku)?.pickFace ??
  state.movements.find((m) => m.sku === sku && m.doc === "INV-INICIAL" && m.to.endsWith("-1"))?.to;

/** Regla min/max de la ubicación de picking: máx = ½ del máximo del SKU sin pasar la capacidad del bin; mín = 35 % del máx. */
export function pickFaceRule(state: State, p: State["products"][number]) {
  const loc = pickFaceLoc(state, p.sku);
  const cap = state.locations.find((l) => l.code === loc)?.capacity ?? 150;
  const max = Math.min(cap, Math.round(p.max * 0.5));
  return { loc, max, min: Math.max(1, Math.round(max * 0.35)) };
}

export function replenishPlan(state: State, bal = computeBalances(state)) {
  const out = [];
  for (const p of state.products) {
    const r = pickFaceRule(state, p);
    if (!r.loc) continue;
    const here = balancesAt(bal, r.loc).filter((b) => b.sku === p.sku);
    const qty = here.reduce((n, b) => n + b.qty, 0);
    const reserved = here.reduce((n, b) => n + b.reserved, 0);
    const open = state.tasks.filter((t) => t.type === "reabastecer" && t.status !== "completo" && t.sku === p.sku && t.suggested === r.loc);
    const incoming = open.reduce((n, t) => n + (t.qty ?? 0), 0);
    const free = qty - reserved;
    const effective = free + incoming;
    const room = Math.max(0, r.max - qty - incoming);
    const need = effective < r.min ? Math.min(room, r.max - effective) : 0;
    const src = need ? allocate(state, p.sku, need, bal, (l) => l.type === "almacenaje" && l.code !== r.loc) : { picks: [], short: 0 };
    out.push({ product: p, ...r, qty, reserved, free, incoming, open, need, sources: src.picks, short: src.short,
      status: (free <= 0 && reserved > 0 ? "urgente" : effective < r.min ? (need ? "bajo" : "sin_espacio") : incoming ? "en_curso" : "ok") as "urgente" | "bajo" | "sin_espacio" | "en_curso" | "ok" });
  }
  return out;
}

/** Crea tareas de reabasto (reserva → picking). Devuelve cuántas creó. */
function genReplenish(s: State, skus: string[], ts: number, user: string, auto: boolean) {
  const plan = replenishPlan(s).filter((x) => skus.includes(x.product.sku) && x.need > 0 && x.sources.length);
  let n = 0;
  for (const x of plan)
    for (const src of x.sources) {
      s.tasks.push({ id: nextId(s, "TSK"), type: "reabastecer", status: "pendiente", priority: x.status === "urgente" ? 1 : 2, doc: auto ? "REAB-AUTO" : "REAB", createdAt: ts,
        sku: x.product.sku, lot: src.lot, qty: src.qty, from: src.loc, suggested: x.loc });
      n++;
    }
  if (n) log(s, ts, user, auto ? "Reabasto automático" : "Generó reabasto", plan.map((x) => x.product.sku).join(", "), `${n} tarea(s) reserva → picking`);
  return n;
}

/** Compras sugeridas: posición (disponible + en tránsito) contra punto de reorden (mín) y máximo, redondeado a caja. */
export function purchasePlan(state: State, bal = computeBalances(state), now = Date.now()) {
  const totals = skuTotals(state, bal);
  const since = now - 7 * 86_400_000;
  return state.products.map((p) => {
    const t = totals.get(p.sku)!;
    const inbound = state.receipts.filter((r) => r.status !== "completo").flatMap((r) => r.lines).filter((l) => l.sku === p.sku)
      .reduce((n, l) => n + Math.max(0, l.expected - l.received), 0);
    const demand = state.movements.filter((m) => m.sku === p.sku && m.type === "surtido" && m.ts >= since).reduce((n, m) => n + m.qty, 0) / 7;
    const position = t.available + inbound;
    const box = p.packs[0]?.factor ?? 1;
    const reorder = position <= p.min;
    const suggested = reorder ? Math.ceil((p.max - position) / box) * box : 0;
    const supplier = [...state.receipts].reverse().find((r) => r.lines.some((l) => l.sku === p.sku))?.supplier ?? "Proveedor preferente";
    return { product: p, available: t.available, inbound, position, demand, cover: demand ? t.available / demand : Infinity, reorder, suggested, box, supplier };
  });
}

// ---------- Cuarentena ----------
export const QUA = "QUA-01";

/** Partidas en cuarentena con su origen y qué decisiones están permitidas (y por qué no). */
export function quarantineItems(state: State, bal = computeBalances(state), now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const releasing = (sku: string, lot?: string) => state.tasks.filter((t) => t.type === "ubicar" && t.from === QUA && t.status !== "completo" && t.sku === sku && (t.lot ?? "") === (lot ?? ""))
    .reduce((n, t) => n + (t.qty ?? 0), 0);
  return balancesAt(bal, QUA).map((b) => ({ ...b, releasing: releasing(b.sku, b.lot) })).filter((b) => b.qty - b.releasing > 0).map((b) => {
    const entries = state.movements.filter((m) => m.to === QUA && m.sku === b.sku && (m.lot ?? "") === (b.lot ?? ""));
    const last = entries.at(-1);
    const first = entries[0];
    const lot = b.lot ? state.lots.find((l) => l.code === b.lot) : undefined;
    const doc = last?.doc ?? "";
    const origin = lot?.hold?.recall ? "Recall" : doc.startsWith("RMA") ? "Devolución de cliente" : doc.startsWith("PED") ? "Retiro de pedido" : doc.startsWith("CNT") ? "Conteo" : "Otro";
    const block = lot?.hold?.recall ? `Lote en recall ${lot.hold.recall}: no puede volver a stock`
      : lot?.hold ? "Lote retenido por calidad: libera primero el lote"
      : lot?.expiryDate && lot.expiryDate < today ? `Lote vencido (${lot.expiryDate})`
      : undefined;
    return { ...b, qty: b.qty - b.releasing, lotInfo: lot, doc, note: last?.note, origin, since: first?.ts ?? now, days: Math.floor((now - (first?.ts ?? now)) / 86_400_000), releaseBlock: block };
  });
}

export const pendingWithdraw = (s: State, order: string) =>
  s.tasks.some((t) => t.type === "retirar" && t.orderRef === order && t.status !== "completo");

export const needsRework = (o: Order) => o.stage !== "enviado" && o.stage !== "nuevo" && (!!o.hold || !!o.exception?.includes("recall"));

/** Plan de re-surtido de un pedido afectado por un lote retenido: qué se retira, qué se conserva y qué se repone. */
export function reworkPlan(state: State, orderId: string, bal = computeBalances(state)) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return null;
  const stg = stagingFor(o.carrier);
  const lots = new Map(state.lots.map((l) => [l.code, l]));
  const bad = (lot?: string) => { const l = lot ? lots.get(lot) : undefined; return !!l && !isLotUsable(state, l); };
  const open = state.tasks.filter((t) => t.type === "surtir" && t.status !== "completo").flatMap((t) => t.steps ?? [])
    .filter((st) => st.order === o.id && st.status === "pendiente" && !bad(st.lot));
  const lines = o.lines.map((l) => {
    const here = [PACK_LOC, stg].flatMap((loc) => orderLotsAt(state, o.id, loc, l.sku).map((x) => ({ ...x, loc })));
    const held = here.filter((x) => bad(x.lot));
    const good = here.filter((x) => !bad(x.lot)).reduce((n, x) => n + x.qty, 0);
    const pending = open.filter((st) => st.sku === l.sku).reduce((n, st) => n + st.qty - st.done, 0);
    const need = Math.max(0, l.qty - good - pending);
    const alloc = need ? allocate(state, l.sku, need, bal) : { picks: [], short: 0 };
    return { sku: l.sku, qty: l.qty, good, held, pending, need, picks: alloc.picks, short: alloc.short };
  });
  const sum = (f: (x: (typeof lines)[number]) => number) => lines.reduce((n, x) => n + f(x), 0);
  return { order: o, stg, lines, unpack: o.stage === "empacado", boxes: o.boxes ?? [],
    heldUnits: sum((x) => x.held.reduce((n, h) => n + h.qty, 0)), replaceUnits: sum((x) => x.need - x.short), shortUnits: sum((x) => x.short),
    stops: new Set(lines.flatMap((x) => x.picks.map((p) => p.loc))).size };
}

/** Análisis de impacto de un recall: dónde está el lote hoy y a quién llegó. */
export function recallImpact(state: State, lotCode: string, bal = computeBalances(state)) {
  const locType = new Map(state.locations.map((l) => [l.code, l.type]));
  const here = [...bal.values()].filter((b) => b.lot === lotCode && b.qty > 0);
  const inStock = here.filter((b) => ["almacenaje", "picking", "recepcion"].includes(locType.get(b.loc) ?? ""));
  const inQuarantine = here.filter((b) => b.loc === "QUA-01");
  const inProcess = here.filter((b) => ["empaque", "staging"].includes(locType.get(b.loc) ?? ""));
  const openSteps = state.tasks.filter((t) => t.type === "surtir" && t.status !== "completo").flatMap((t) => t.steps ?? [])
    .filter((st) => st.lot === lotCode && st.status === "pendiente");
  const shippedBy = new Map<string, number>();
  for (const m of state.movements) if (m.lot === lotCode && m.type === "envio" && m.doc) shippedBy.set(m.doc, (shippedBy.get(m.doc) ?? 0) + m.qty);
  const shipped = [...shippedBy.entries()].map(([order, qty]) => ({ order: state.orders.find((o) => o.id === order)!, qty })).filter((x) => x.order);
  const received = state.movements.filter((m) => m.lot === lotCode && m.from === "PROV").reduce((n, m) => n + m.qty, 0);
  const returned = state.movements.filter((m) => m.lot === lotCode && m.type === "devolucion").reduce((n, m) => n + m.qty, 0);
  // Fuera de circulación: destruido/devuelto a proveedor o devuelto por cliente directo a merma
  const disposed = state.movements.filter((m) => m.lot === lotCode && (m.to === "AJUSTE" || m.to === "PROV") && (m.type === "ajuste" || m.type === "devolucion") && m.from !== "PROV")
    .reduce((n, m) => n + m.qty, 0);
  const sum = (x: { qty: number }[]) => x.reduce((n, b) => n + b.qty, 0);
  return { inStock, inQuarantine, inProcess, openSteps, shipped, received, returned,
    units: { stock: sum(inStock), quarantine: sum(inQuarantine), process: sum(inProcess), shipped: sum(shipped), returned, disposed,
      atCustomers: Math.max(0, sum(shipped) - returned) } };
}

function shipOrder(s: State, id: string, ts: number, user: string, device: Movement["device"]) {
  const o = s.orders.find((x) => x.id === id);
  if (!o || o.stage !== "empacado" || o.hold) return;
  const stg = stagingFor(o.carrier);
  for (const l of o.lines)
    for (const part of orderLotsAt(s, o.id, stg, l.sku))
      move(s, { ts, type: "envio", sku: l.sku, lot: part.lot, from: stg, to: "CLIENTE", qty: part.qty, user, device, doc: o.id });
  o.stage = "enviado";
  o.shippedAt = ts;
  for (const w of s.waves)
    if (w.status !== "completo" && w.orders.every((oid) => s.orders.find((x) => x.id === oid)?.stage === "enviado")) w.status = "completo";
}

export function doorBusy(s: State, door: string, except?: string) {
  return s.appointments.find((x) => x.door === door && x.status === "en_anden" && x.id !== except);
}

/** Unidades enviadas de un SKU en un pedido que aún pueden devolverse. */
export function returnable(s: State, order: string, sku: string) {
  const shipped = s.movements.filter((m) => m.doc === order && m.type === "envio" && m.sku === sku).reduce((n, m) => n + m.qty, 0);
  const authorized = s.rmas.filter((r) => r.order === order).flatMap((r) => r.lines).filter((l) => l.sku === sku).reduce((n, l) => n + l.qty, 0);
  return Math.max(0, shipped - authorized);
}

/** Puertas con cita que se traslapa en el horario propuesto. */
export function apptConflicts(s: State, door: string, start: number, durationMin: number, except?: string) {
  const end = start + durationMin * 60_000;
  return s.appointments.filter((x) => x.door === door && x.id !== except && !["cancelada", "completada"].includes(x.status) &&
    x.start < end && x.start + x.durationMin * 60_000 > start);
}

function createCount(s: State, ts: number, locations: string[], reason: string, user: string) {
  const bal = computeBalances(s);
  const lines: CountLine[] = [];
  for (const loc of locations) {
    const here = balancesAt(bal, loc);
    if (!here.length) lines.push({ location: loc, expected: 0 });
    here.forEach((b) => lines.push({ location: loc, sku: b.sku, lot: b.lot, expected: b.qty }));
  }
  const id = nextId(s, "CNT");
  const taskId = nextId(s, "TSK");
  s.counts.unshift({ id, createdAt: ts, reason, blind: s.rules.blindCount, status: "pendiente", task: taskId, lines });
  s.tasks.push({ id: taskId, type: "contar", status: "pendiente", priority: 2, doc: id, createdAt: ts, locations });
  log(s, ts, user, "Generó conteo cíclico", id, `${locations.length} ubicación(es) · ${reason}`);
}

// ---------- Búsqueda universal (escanear cualquier código) ----------
export type LookupHit =
  | { kind: "producto"; product: Product }
  | { kind: "ubicacion"; location: Location }
  | { kind: "lote"; lot: State["lots"][number] }
  | { kind: "pedido"; order: Order }
  | { kind: "recepcion"; id: string }
  | { kind: "tarea"; task: Task }
  | { kind: "rma"; rma: State["rmas"][number] }
  | { kind: "cita"; appt: State["appointments"][number] };

export function lookup(state: State, raw: string): LookupHit[] {
  const gs = parseGs1(raw);
  const q = (gs?.gtin ? eanFromGtin(gs.gtin) : raw).trim().toUpperCase();
  if (!q) return [];
  const hits: LookupHit[] = [];
  for (const p of state.products)
    if (p.sku === q || p.barcode === q || p.sku.includes(q) || p.name.toUpperCase().includes(q)) hits.push({ kind: "producto", product: p });
  for (const l of state.locations) if (l.code.includes(q)) hits.push({ kind: "ubicacion", location: l });
  for (const l of state.lots) if (l.code.includes(q)) hits.push({ kind: "lote", lot: l });
  for (const o of state.orders) if (o.id.includes(q) || o.customer.toUpperCase().includes(q)) hits.push({ kind: "pedido", order: o });
  for (const r of state.receipts) if (r.id.includes(q) || r.asn?.includes(q) || r.supplier.toUpperCase().includes(q)) hits.push({ kind: "recepcion", id: r.id });
  for (const t of state.tasks) if (t.id === q) hits.push({ kind: "tarea", task: t });
  for (const r of state.rmas) if (r.id.includes(q) || r.order === q) hits.push({ kind: "rma", rma: r });
  for (const ap of state.appointments) if (ap.id.includes(q) || ap.plate?.toUpperCase().includes(q)) hits.push({ kind: "cita", appt: ap });
  // Coincidencia exacta primero
  const exact = (h: LookupHit) =>
    (h.kind === "producto" && (h.product.sku === q || h.product.barcode === q)) ||
    (h.kind === "ubicacion" && h.location.code === q) || (h.kind === "lote" && h.lot.code === q) ||
    (h.kind === "pedido" && h.order.id === q) || (h.kind === "recepcion" && h.id === q) || (h.kind === "rma" && h.rma.id === q);
  return hits.sort((a, b) => Number(exact(b)) - Number(exact(a))).slice(0, 12);
}

// Tarea dirigida por el sistema: la de mayor prioridad del usuario, luego sin asignar.
export function nextTaskFor(state: State, userId: string) {
  const open = state.tasks.filter((t) => t.status !== "completo" && (t.assignee === userId || !t.assignee));
  return open.sort((a, b) =>
    Number(b.assignee === userId) - Number(a.assignee === userId) ||
    Number(b.status === "en_proceso") - Number(a.status === "en_proceso") ||
    a.priority - b.priority || a.createdAt - b.createdAt)[0];
}
