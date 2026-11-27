import { applyAction } from "../core/engine";
import type { Action, Location, Order, OrderLine, Product, Receipt, State, User } from "../core/types";

export const SEED_VERSION = 7;

const H = 3_600_000;
const D = 24 * H;

const users: User[] = [
  { id: "u1", name: "Lucía Méndez", role: "operario", initials: "LM", shift: "Matutino" },
  { id: "u2", name: "Diego Ramírez", role: "operario", initials: "DR", shift: "Matutino" },
  { id: "u3", name: "Sofía Herrera", role: "operario", initials: "SH", shift: "Matutino" },
  { id: "u4", name: "Andrés Torres", role: "empacador", initials: "AT", shift: "Matutino" },
  { id: "u5", name: "Mariana López", role: "supervisor", initials: "ML", shift: "Matutino" },
  { id: "u6", name: "Roberto Silva", role: "gerente", initials: "RS", shift: "Matutino" },
  { id: "u7", name: "Carmen Ruiz", role: "admin", initials: "CR", shift: "Matutino" },
  { id: "u8", name: "Javier Ortega", role: "auditor", initials: "JO", shift: "Matutino" },
];

type P = Omit<Product, "barcode" | "packs" | "uom"> & { box: number };
const base: P[] = [
  { sku: "CAF-500", name: "Café molido 500 g", category: "Abarrotes", emoji: "☕", weightKg: 0.5, lotTracked: true, expiryTracked: true, abc: "A", min: 60, max: 300, preferredZone: "A", box: 12 },
  { sku: "ACE-1L", name: "Aceite de oliva 1 L", category: "Abarrotes", emoji: "🫒", weightKg: 0.95, lotTracked: true, expiryTracked: true, abc: "B", min: 40, max: 200, preferredZone: "A", box: 12 },
  { sku: "ARR-1K", name: "Arroz grano largo 1 kg", category: "Abarrotes", emoji: "🍚", weightKg: 1, lotTracked: true, expiryTracked: true, abc: "A", min: 80, max: 400, preferredZone: "A", box: 10 },
  { sku: "AGU-600", name: "Agua natural 600 ml", category: "Bebidas", emoji: "💧", weightKg: 0.62, lotTracked: true, expiryTracked: true, abc: "A", min: 100, max: 500, preferredZone: "A", box: 24 },
  { sku: "JUG-1L", name: "Jugo de naranja 1 L", category: "Bebidas", emoji: "🧃", weightKg: 1.05, lotTracked: true, expiryTracked: true, abc: "B", min: 50, max: 240, preferredZone: "A", box: 12 },
  { sku: "JAB-3P", name: "Jabón de tocador 3 pzas", category: "Higiene", emoji: "🧼", weightKg: 0.36, lotTracked: true, expiryTracked: false, abc: "B", min: 40, max: 200, preferredZone: "B", box: 24 },
  { sku: "SHA-750", name: "Shampoo 750 ml", category: "Higiene", emoji: "🧴", weightKg: 0.8, lotTracked: true, expiryTracked: true, abc: "B", min: 30, max: 160, preferredZone: "B", box: 12 },
  { sku: "GUA-NM", name: "Guantes de nitrilo M (100)", category: "Higiene", emoji: "🧤", weightKg: 0.55, lotTracked: false, expiryTracked: false, abc: "C", min: 20, max: 120, preferredZone: "B", box: 10 },
  { sku: "CIN-48", name: "Cinta canela 48 mm", category: "Papelería", emoji: "📦", weightKg: 0.25, lotTracked: false, expiryTracked: false, abc: "B", min: 50, max: 300, preferredZone: "B", box: 36 },
  { sku: "CUA-100", name: "Cuaderno profesional 100 h", category: "Papelería", emoji: "📓", weightKg: 0.42, lotTracked: false, expiryTracked: false, abc: "C", min: 30, max: 200, preferredZone: "B", box: 20 },
  { sku: "TOR-14", name: "Tornillo 1/4\" (bolsa 100)", category: "Ferretería", emoji: "🔩", weightKg: 0.7, lotTracked: false, expiryTracked: false, abc: "C", min: 20, max: 150, preferredZone: "C", box: 20 },
  { sku: "LED-9W", name: "Foco LED 9 W", category: "Electrónica", emoji: "💡", weightKg: 0.08, lotTracked: false, expiryTracked: false, abc: "B", min: 60, max: 400, preferredZone: "C", box: 50 },
  { sku: "USB-C1", name: "Cable USB-C 1 m", category: "Electrónica", emoji: "🔌", weightKg: 0.05, lotTracked: false, expiryTracked: false, abc: "A", min: 50, max: 300, preferredZone: "C", box: 50 },
  { sku: "AUD-BT", name: "Audífonos Bluetooth", category: "Electrónica", emoji: "🎧", weightKg: 0.2, lotTracked: true, expiryTracked: false, abc: "A", min: 25, max: 120, preferredZone: "C", box: 10 },
];

const products: Product[] = base.map(({ box, ...p }, i) => ({
  ...p,
  barcode: `7501${String(305871 + i * 7919).padStart(8, "0")}${(i * 7) % 10}`,
  uom: "pza",
  packs: [{ uom: "caja", factor: box }, { uom: "tarima", factor: box * 40 }],
}));

function buildLocations(): Location[] {
  const out: Location[] = [];
  for (const zone of ["A", "B", "C"])
    for (const aisle of ["01", "02"])
      for (const rack of ["01", "02", "03", "04"])
        for (const level of ["1", "2", "3"])
          out.push({ code: `${zone}-${aisle}-${rack}-${level}`, zone, aisle, rack, level,
            type: level === "1" ? "picking" : "almacenaje", capacity: level === "1" ? 150 : 320 });
  out.push(
    { code: "REC-01", zone: "REC", type: "recepcion", capacity: 5000 },
    { code: "REC-02", zone: "REC", type: "recepcion", capacity: 5000 },
    { code: "QUA-01", zone: "QUA", type: "cuarentena", capacity: 800 },
    { code: "PACK-01", zone: "PACK", type: "empaque", capacity: 2000 },
    { code: "STG-ESTAFETA", zone: "STG", type: "staging", capacity: 2000 },
    { code: "STG-DHL", zone: "STG", type: "staging", capacity: 2000 },
    { code: "STG-FEDEX", zone: "STG", type: "staging", capacity: 2000 },
    { code: "STG-99MIN", zone: "STG", type: "staging", capacity: 2000 },
  );
  return out;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function line(sku: string, qty: number): OrderLine {
  return { sku, qty, picked: 0, packed: 0, short: 0 };
}

export function buildSeed(now = Date.now()): State {
  const t0 = now - 30 * D;
  let s: State = {
    version: SEED_VERSION,
    warehouse: { code: "CDMX-01", name: "CEDIS Vallejo" },
    users, products, locations: buildLocations(), lots: [], movements: [], receipts: [], orders: [], waves: [],
    tasks: [], counts: [], audit: [],
    docks: [
      { code: "AND-01", kind: "entrada", stage: "REC-01" }, { code: "AND-02", kind: "entrada", stage: "REC-02" },
      { code: "AND-03", kind: "entrada", stage: "REC-02" }, { code: "AND-04", kind: "salida", stage: "STG-DHL" },
      { code: "AND-05", kind: "salida", stage: "STG-ESTAFETA" }, { code: "AND-06", kind: "salida", stage: "STG-FEDEX" },
    ],
    appointments: [], rmas: [], recalls: [], sensors: buildSensors(now), excursions: [], qc: [],
    rules: { removal: "FEFO", putaway: "zona_preferida", blindCount: true, autoReplenish: true, blockExpired: true },
    seq: 100, offline: false, queue: [],
  };

  // --- Inventario inicial: 2 ubicaciones por SKU (picking nivel 1 + reserva nivel 2) ---
  const zoneIdx: Record<string, number> = { A: 0, B: 0, C: 0 };
  const qtyPlan: Record<string, [number, number]> = {
    "AUD-BT": [9, 8], "USB-C1": [38, 30], "CAF-500": [70, 150], "JUG-1L": [36, 96],
  };
  products.forEach((p, i) => {
    const k = zoneIdx[p.preferredZone]++;
    const aisle = k < 4 ? "01" : "02";
    const rack = String((k % 4) + 1).padStart(2, "0");
    const [q1, q2] = qtyPlan[p.sku] ?? [60 + ((i * 17) % 70), 140 + ((i * 41) % 150)];
    const lots = p.lotTracked
      ? [
          { code: `L${p.sku.slice(0, 3)}${2610 + i}`, exp: p.expiryTracked ? iso(now + (p.sku === "CAF-500" ? 18 : p.sku === "JUG-1L" ? 24 : 70 + i * 9) * D) : undefined },
          { code: `L${p.sku.slice(0, 3)}${2650 + i}`, exp: p.expiryTracked ? iso(now + (160 + i * 11) * D) : undefined },
        ]
      : [undefined, undefined];
    [q1, q2].forEach((qty, j) => {
      const lot = lots[j];
      if (lot) s.lots.push({ code: lot.code, sku: p.sku, expiryDate: lot.exp, mfgDate: iso(t0 - 20 * D), origin: "INV-INICIAL" });
      s.movements.push({
        id: `MOV-0${i}${j}`, ts: t0 + i * 60_000 + j * 1000, type: "recepcion", sku: p.sku, lot: lot?.code,
        from: "PROV", to: `${p.preferredZone}-${aisle}-${rack}-${j + 1}`, qty, user: "u7", device: "Consola", doc: "INV-INICIAL",
      });
    });
  });

  const run = (a: Action) => { s = applyAction(s, a); };
  const tasksOf = (doc: string, type?: string) => s.tasks.filter((t) => t.doc === doc && (!type || t.type === type));

  // --- Recepciones ---
  const receipts: Receipt[] = [
    { id: "OC-1039", asn: "ASN-88190", supplier: "Distribuidora del Valle", dock: "REC-01", appointment: now - 27 * H, status: "pendiente",
      lines: [{ sku: "CAF-500", expected: 120, received: 0 }, { sku: "AGU-600", expected: 96, received: 0 }] },
    { id: "OC-1041", asn: "ASN-88207", supplier: "Higiene Total S.A.", dock: "REC-02", appointment: now - 3.5 * H, status: "pendiente",
      lines: [{ sku: "SHA-750", expected: 60, received: 0 }, { sku: "GUA-NM", expected: 40, received: 0 }] },
    { id: "OC-1042", asn: "ASN-88213", supplier: "Abarrotes del Norte", dock: "REC-01", appointment: now + 0.75 * H, status: "pendiente",
      lines: [{ sku: "ARR-1K", expected: 100, received: 0 }, { sku: "ACE-1L", expected: 48, received: 0 }, { sku: "JUG-1L", expected: 60, received: 0 }] },
    { id: "OC-1043", supplier: "TecnoImport MX", dock: "REC-02", appointment: now + 20 * H, status: "pendiente",
      lines: [{ sku: "LED-9W", expected: 200, received: 0 }, { sku: "AUD-BT", expected: 50, received: 0 }, { sku: "USB-C1", expected: 150, received: 0 }] },
  ];
  s.receipts = receipts;

  // --- Citas de andén (entrada) ---
  const appt = (kind: "entrada" | "salida", party: string, door: string, start: number, durationMin: number, extra: { receipt?: string; carrier?: Order["carrier"] } = {}) => {
    run({ type: "SCHEDULE_APPT", kind, party, door, start, durationMin, user: "u5", at: start - 20 * H, ...extra });
    return s.appointments.at(-1)!.id;
  };
  const arrive = (id: string, plate: string, at: number, dockAt?: number, door?: string) => {
    run({ type: "CHECK_IN", appt: id, plate, user: "u5", at });
    if (dockAt) run({ type: "DOCK_APPT", appt: id, door: door ?? s.appointments.find((x) => x.id === id)!.door!, user: "u5", at: dockAt });
  };
  const c1039 = appt("entrada", "Distribuidora del Valle", "AND-01", now - 27 * H, 60, { receipt: "OC-1039" });
  arrive(c1039, "MX-41-TRK", now - 27.1 * H, now - 26.8 * H);
  const c1041 = appt("entrada", "Higiene Total S.A.", "AND-02", now - 3.5 * H, 60, { receipt: "OC-1041" });
  arrive(c1041, "NL-88-HTS", now - 3.4 * H, now - 3.15 * H);
  appt("entrada", "Abarrotes del Norte", "AND-01", now + 0.75 * H, 90, { receipt: "OC-1042" });
  appt("entrada", "TecnoImport MX", "AND-02", now + 20 * H, 120, { receipt: "OC-1043" });

  // OC-1039: recibida y ubicada ayer
  run({ type: "RECEIVE_LINE", receipt: "OC-1039", sku: "CAF-500", qty: 120, lot: "LCAF2701", expiry: iso(now + 240 * D), user: "u2", at: now - 26.6 * H, device: "Handheld" });
  run({ type: "RECEIVE_LINE", receipt: "OC-1039", sku: "AGU-600", qty: 96, lot: "LAGU2702", expiry: iso(now + 300 * D), user: "u2", at: now - 26.4 * H, device: "Handheld" });
  tasksOf("OC-1039", "ubicar").forEach((t, i) =>
    run({ type: "CONFIRM_PUTAWAY", task: t.id, to: t.suggested!, user: "u2", at: now - (25.8 - i * 0.3) * H, device: "Handheld" }));
  run({ type: "CLOSE_RECEIPT", receipt: "OC-1039", user: "u5", at: now - 25 * H });
  // OC-1041: recibida hoy, ubicación pendiente
  run({ type: "RECEIVE_LINE", receipt: "OC-1041", sku: "SHA-750", qty: 60, lot: "LSHA2710", expiry: iso(now + 400 * D), user: "u3", at: now - 3 * H, device: "Handheld" });
  run({ type: "RECEIVE_LINE", receipt: "OC-1041", sku: "GUA-NM", qty: 38, user: "u3", at: now - 2.9 * H, device: "Handheld" });
  run({ type: "CLOSE_RECEIPT", receipt: "OC-1041", user: "u5", at: now - 2.8 * H });
  run({ type: "COMPLETE_APPT", appt: c1039, user: "u5", at: now - 26.2 * H });
  run({ type: "COMPLETE_APPT", appt: c1041, user: "u5", at: now - 2.7 * H });

  // --- Pedidos ---
  const mk = (id: string, customer: string, channel: Order["channel"], carrier: Order["carrier"], created: number, due: number, lines: OrderLine[], priority: Order["priority"] = "normal"): Order =>
    ({ id, customer, channel, carrier, priority, createdAt: created, due, stage: "nuevo", lines });
  s.orders = [
    mk("PED-5001", "Tienda La Esquina", "B2B", "Estafeta", now - 31 * H, now - 8 * H, [line("CAF-500", 24), line("ARR-1K", 20), line("ACE-1L", 12)]),
    mk("PED-5002", "María G. — Shopify", "Shopify", "99 Minutos", now - 30 * H, now - 10 * H, [line("AUD-BT", 1), line("USB-C1", 2)]),
    mk("PED-5003", "Amazon FBM #113-88", "Amazon", "DHL", now - 30 * H, now - 9 * H, [line("SHA-750", 3), line("JAB-3P", 2)]),
    mk("PED-5004", "Ferretería Hidalgo", "B2B", "Estafeta", now - 29 * H, now - 6 * H, [line("TOR-14", 30), line("LED-9W", 40)]),
    mk("PED-5005", "ML — usuario jperez", "Mercado Libre", "FedEx", now - 29 * H, now - 7 * H, [line("CUA-100", 5), line("CIN-48", 6)]),
    mk("PED-5006", "Café Central", "B2B", "DHL", now - 6 * H, now + 6 * H, [line("CAF-500", 12), line("AGU-600", 24)], "alta"),
    mk("PED-5007", "Amazon FBM #113-91", "Amazon", "DHL", now - 5 * H, now + 8 * H, [line("JUG-1L", 6), line("ARR-1K", 4)]),
    mk("PED-5008", "Oficinas Reforma", "B2B", "Estafeta", now - 5 * H, now + 10 * H, [line("CIN-48", 12), line("CUA-100", 20), line("GUA-NM", 4), line("JAB-3P", 6)]),
    mk("PED-5009", "Hotel Roma Norte", "B2B", "Estafeta", now - 4 * H, now - 0.5 * H, [line("JAB-3P", 30), line("SHA-750", 18), line("GUA-NM", 6)], "alta"),
    mk("PED-5010", "Luis P. — Shopify", "Shopify", "99 Minutos", now - 3 * H, now + 5 * H, [line("AUD-BT", 2)], "alta"),
    mk("PED-5011", "ML — usuario ana.r", "Mercado Libre", "FedEx", now - 3 * H, now + 20 * H, [line("LED-9W", 6), line("USB-C1", 3)]),
    mk("PED-5012", "Amazon FBM #113-97", "Amazon", "DHL", now - 2.5 * H, now + 18 * H, [line("CAF-500", 4), line("JUG-1L", 6)]),
    mk("PED-5013", "Minisúper Doña Tere", "B2B", "Estafeta", now - 2 * H, now + 22 * H, [line("ARR-1K", 30), line("ACE-1L", 12), line("AGU-600", 48)]),
    mk("PED-5014", "Carla M. — Shopify", "Shopify", "99 Minutos", now - 1.5 * H, now + 6 * H, [line("SHA-750", 2), line("JAB-3P", 1)]),
    mk("PED-5015", "ML — usuario tecnofan", "Mercado Libre", "FedEx", now - 1 * H, now + 26 * H, [line("AUD-BT", 16), line("USB-C1", 10)]),
    mk("PED-5016", "Papelería Escolar Sur", "B2B", "Estafeta", now - 0.5 * H, now + 28 * H, [line("CUA-100", 40), line("CIN-48", 24)]),
  ];

  // Historia de ayer: oleada completa con una excepción
  run({ type: "RELEASE_WAVE", orders: ["PED-5001", "PED-5002", "PED-5003", "PED-5004", "PED-5005"], criteria: "Corte 14:00 · todos los transportistas", user: "u5", at: now - 28 * H });
  ["PED-5001", "PED-5002", "PED-5003", "PED-5004", "PED-5005"].forEach((oid, oi) => {
    const t = tasksOf(oid, "surtir")[0];
    if (!t) return;
    t.steps!.forEach((st, si) => {
      const at = now - (27.5 - oi * 0.4 - si * 0.05) * H;
      if (oid === "PED-5004" && si === 1) run({ type: "PICK_EXCEPTION", task: t.id, index: si, kind: "faltante", user: t.assignee!, at, device: "Handheld" });
      else run({ type: "PICK_STEP", task: t.id, index: si, qty: st.qty, user: t.assignee!, at, device: "Handheld" });
    });
    run({ type: "PACK_ORDER", order: oid, box: oi % 2 ? "Caja M" : "Caja L", weightKg: 2 + oi * 1.3, user: "u4", at: now - (25 - oi * 0.2) * H, device: "Estación" });
  });
  // Ayer: cada transportista recogió en su cita de andén
  const pickups: [Order["carrier"], string, string[]][] = [
    ["Estafeta", "AND-05", ["PED-5001", "PED-5004"]], ["DHL", "AND-04", ["PED-5003"]],
    ["FedEx", "AND-06", ["PED-5005"]], ["99 Minutos", "AND-04", ["PED-5002"]],
  ];
  pickups.forEach(([carrier, door, orders], i) => {
    const start = now - (22.5 - i * 0.6) * H;
    const id = appt("salida", carrier, door, start, 30, { carrier });
    arrive(id, `CDMX-${carrier.slice(0, 3).toUpperCase()}-${10 + i}`, start - 0.2 * H, start + 0.05 * H);
    orders.forEach((o, j) => run({ type: "LOAD_ORDER", appt: id, order: o, user: "u4", at: start + (0.1 + j * 0.05) * H, device: "Handheld" }));
    run({ type: "COMPLETE_APPT", appt: id, user: "u5", at: start + 0.4 * H });
  });

  // Devoluciones
  run({ type: "CREATE_RMA", order: "PED-5001", lines: [{ sku: "CAF-500", qty: 2 }], reason: "Error del cliente al pedir", user: "u5", at: now - 21 * H });
  const rmaA = s.rmas[0].id;
  run({ type: "RECEIVE_RETURN", rma: rmaA, sku: "CAF-500", qty: 2, condition: "buena", disposition: "reubicar", user: "u3", at: now - 20 * H, device: "Handheld" });
  const rmaTask = tasksOf(rmaA, "ubicar")[0];
  run({ type: "CONFIRM_PUTAWAY", task: rmaTask.id, to: rmaTask.suggested!, user: "u3", at: now - 19.8 * H, device: "Handheld" });
  run({ type: "ISSUE_CREDIT", rma: rmaA, user: "u6", at: now - 19 * H });
  run({ type: "CREATE_RMA", order: "PED-5002", lines: [{ sku: "AUD-BT", qty: 1 }], reason: "No enciende (garantía)", user: "u5", at: now - 9 * H });
  run({ type: "RECEIVE_RETURN", rma: s.rmas[0].id, sku: "AUD-BT", qty: 1, condition: "defectuosa", disposition: "cuarentena", user: "u2", at: now - 5 * H, device: "Handheld" });
  run({ type: "CREATE_RMA", order: "PED-5003", lines: [{ sku: "SHA-750", qty: 1 }, { sku: "JAB-3P", qty: 2 }], reason: "Llegó dañado en tránsito", user: "u5", at: now - 4 * H });
  // El faltante generó un conteo: se contó y se aprobó el ajuste
  const autoCount = s.counts[0];
  if (autoCount) {
    const vals: Record<string, number> = {};
    autoCount.lines.forEach((l, i) => (vals[i] = Math.max(0, l.expected - 12)));
    run({ type: "SUBMIT_COUNT", count: autoCount.id, values: vals, user: "u1", at: now - 21 * H, device: "Handheld" });
    run({ type: "APPROVE_COUNT", count: autoCount.id, user: "u5", at: now - 20 * H });
  }
  // Conteo cíclico ABC de la semana, sin diferencias
  run({ type: "CREATE_COUNT", locations: ["A-01-01-1", "A-01-02-1", "B-01-01-1", "C-02-01-1"], reason: "Cíclico ABC (clase A)", user: "u5", at: now - 46 * H });
  const abc = s.counts[0];
  run({ type: "SUBMIT_COUNT", count: abc.id, values: Object.fromEntries(abc.lines.map((l, i) => [i, l.expected])), user: "u3", at: now - 45 * H, device: "Handheld" });

  // Oleada de hoy: un pedido empacado, uno surtido, uno en picking
  run({ type: "RELEASE_WAVE", orders: ["PED-5006", "PED-5007", "PED-5008"], criteria: "Corte 10:00 · DHL + Estafeta", user: "u5", at: now - 2 * H });
  const pickAll = (oid: string, upto: number, start: number) => {
    const t = tasksOf(oid, "surtir")[0];
    t?.steps!.slice(0, upto).forEach((st, si) =>
      run({ type: "PICK_STEP", task: t.id, index: si, qty: st.qty, user: t.assignee!, at: start + si * 4 * 60_000, device: "Handheld" }));
  };
  pickAll("PED-5006", 99, now - 1.7 * H);
  run({ type: "PACK_ORDER", order: "PED-5006", box: "Caja L", weightKg: 21.4, user: "u4", at: now - 1.2 * H, device: "Estación" });
  pickAll("PED-5007", 99, now - 1.4 * H);
  pickAll("PED-5008", 2, now - 0.6 * H);
  // Conteo pendiente para el turno
  run({ type: "CREATE_COUNT", locations: ["B-02-01-1", "B-02-01-2", "C-01-03-1"], reason: "Cíclico ABC (clase B)", user: "u5", at: now - 1 * H });

  // Recolecciones de hoy
  appt("salida", "DHL", "AND-04", now + 1.5 * H, 45, { carrier: "DHL" });
  const late99 = appt("salida", "99 Minutos", "AND-04", now - 0.85 * H, 30, { carrier: "99 Minutos" });
  arrive(late99, "CDMX-99M-27", now - 0.7 * H);
  appt("salida", "Estafeta", "AND-05", now + 4 * H, 45, { carrier: "Estafeta" });
  appt("salida", "FedEx", "AND-06", now + 6 * H, 30, { carrier: "FedEx" });

  s.audit.push(
    { id: "AUD-1", ts: now - 30 * D, user: "u7", action: "Cargó inventario inicial", target: "INV-INICIAL", detail: `${products.length} SKU · ${s.movements.length} movimientos` },
  );
  s.excursions = detectExcursions(s.sensors);
  const rev = s.excursions.find((e) => e.sensor === "S-REC");
  if (rev) { rev.reviewedBy = "u5"; rev.note = "Puerta de AND-02 abierta durante descarga; sin producto sensible expuesto."; }
  return { ...s, queue: [], offline: false };
}

// ---------- Sensores de temperatura y humedad (lecturas cada 30 min, últimas 24 h) ----------
function buildSensors(now: number) {
  const step = 30 * 60_000;
  const end = Math.floor(now / step) * step;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const defs = [
    { id: "S-A", name: "Zona A · Abarrotes y bebidas", zone: "A", min: 15, max: 25, humMax: 65, base: 21 },
    { id: "S-B", name: "Zona B · Higiene y papelería", zone: "B", min: 15, max: 27, humMax: 65, base: 22 },
    { id: "S-C", name: "Zona C · Electrónica", zone: "C", min: 10, max: 30, humMax: 55, base: 23 },
    { id: "S-REC", name: "Recepción y andenes", zone: "REC", min: 10, max: 30, humMax: 75, base: 24 },
  ];
  return defs.map(({ base, ...d }) => ({
    ...d,
    readings: Array.from({ length: 49 }, (_, i) => {
      const ts = end - (48 - i) * step;
      const hour = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
      let t = base + 2.2 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + (rnd() - 0.5) * 0.8;
      // Falla de aire acondicionado en zona A hace ~5 h; puerta abierta en recepción ayer
      const ago = (end - ts) / 3_600_000;
      if (d.id === "S-A" && ago <= 6 && ago >= 4.5) t = 25.6 + (1.5 - Math.abs(ago - 5.25)) * 1.1;
      if (d.id === "S-REC" && ago <= 21 && ago >= 20) t = 30.4 + rnd() * 0.6;
      return { ts, t: Math.round(t * 10) / 10, h: Math.round(48 + (rnd() - 0.5) * 10 + (t - base) * 2) };
    }),
  }));
}

function detectExcursions(sensors: ReturnType<typeof buildSensors>) {
  const out: { id: string; sensor: string; start: number; end: number; peak: number }[] = [];
  for (const se of sensors) {
    let cur: (typeof out)[number] | null = null;
    for (const r of se.readings) {
      const bad = r.t > se.max || r.t < se.min;
      if (bad && !cur) cur = { id: `EXC-${se.id}-${out.length + 1}`, sensor: se.id, start: r.ts, end: r.ts, peak: r.t };
      else if (bad && cur) { cur.end = r.ts; if (Math.abs(r.t - se.max) > Math.abs(cur.peak - se.max)) cur.peak = r.t; }
      else if (!bad && cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
  }
  return out;
}
