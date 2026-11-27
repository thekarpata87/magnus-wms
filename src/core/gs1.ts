// Parser GS1-128 / GS1 DataMatrix. Acepta formato legible "(01)…(10)…" o cadena cruda con
// separador FNC1 (GS, \x1d) o el prefijo de simbología "]C1". Ver investigación: "nomenclaturas GS1
// con lote/serie/cantidad embebidos".

export interface Gs1Result {
  sscc?: string;   // AI 00
  gtin?: string;   // AI 01 (14 dígitos)
  lot?: string;    // AI 10
  expiry?: string; // AI 17 → YYYY-MM-DD
  qty?: number;    // AI 37
  serial?: string; // AI 21
  elements: { ai: string; label: string; value: string }[];
}

const AI: Record<string, { label: string; fixed?: number; max?: number }> = {
  "00": { label: "SSCC (tarima)", fixed: 18 },
  "01": { label: "GTIN", fixed: 14 },
  "02": { label: "GTIN contenido", fixed: 14 },
  "10": { label: "Lote", max: 20 },
  "11": { label: "Fecha de producción", fixed: 6 },
  "15": { label: "Consumir preferentemente", fixed: 6 },
  "17": { label: "Caducidad", fixed: 6 },
  "21": { label: "Serie", max: 20 },
  "37": { label: "Cantidad", max: 8 },
};

const GS = "\x1d";

const yymmdd = (v: string) => {
  const y = Number(v.slice(0, 2));
  const dd = v.slice(4, 6) === "00" ? "28" : v.slice(4, 6);
  return `${y >= 50 ? 1900 + y : 2000 + y}-${v.slice(2, 4)}-${dd}`;
};

export function parseGs1(raw: string): Gs1Result | null {
  let s = raw.trim().replace(/^\]C1|^\]d2|^\]Q3/, "");
  const elements: Gs1Result["elements"] = [];
  if (s.startsWith("(")) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) elements.push({ ai: m[1], label: AI[m[1]]?.label ?? `AI ${m[1]}`, value: m[2] });
    if (!elements.length) return null;
  } else {
    if (!/^(00|01|02)\d/.test(s)) return null; // una cadena cruda GS1 empieza por un identificador de producto o tarima
    while (s.length) {
      const ai = s.slice(0, 2);
      const def = AI[ai];
      if (!def) return elements.length ? build(elements) : null;
      s = s.slice(2);
      let value: string;
      if (def.fixed) { value = s.slice(0, def.fixed); s = s.slice(def.fixed); }
      else { const end = s.indexOf(GS); value = end >= 0 ? s.slice(0, end) : s.slice(0, def.max); s = end >= 0 ? s.slice(end + 1) : s.slice(value.length); }
      if (s.startsWith(GS)) s = s.slice(1);
      elements.push({ ai, label: def.label, value });
    }
  }
  return build(elements);
}

function build(elements: Gs1Result["elements"]): Gs1Result | null {
  const r: Gs1Result = { elements };
  for (const e of elements) {
    if (e.ai === "00") r.sscc = e.value;
    if (e.ai === "01" || e.ai === "02") r.gtin = e.value;
    if (e.ai === "10") r.lot = e.value.toUpperCase();
    if (e.ai === "17" && /^\d{6}$/.test(e.value)) r.expiry = yymmdd(e.value);
    if (e.ai === "37") r.qty = Number(e.value) || undefined;
    if (e.ai === "21") r.serial = e.value;
  }
  return r.gtin || r.sscc ? r : null;
}

/** Dígito verificador GS1 (módulo 10) para GTIN/SSCC. */
export function checkDigit(body: string) {
  const sum = body.split("").reverse().reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export const gtinValid = (g: string) => /^\d{14}$/.test(g) && checkDigit(g.slice(0, 13)) === g[13];

/** EAN-13 del producto → GTIN-14 (indicador 0). */
export const toGtin14 = (ean13: string) => ("0" + ean13).slice(-14);

/** Etiqueta GS1-128 legible para un producto/lote/caducidad/cantidad. */
export function buildGs1(ean13: string, lot?: string, expiryIso?: string, qty?: number) {
  let out = `(01)${toGtin14(ean13)}`;
  if (expiryIso) out += `(17)${expiryIso.slice(2, 4)}${expiryIso.slice(5, 7)}${expiryIso.slice(8, 10)}`;
  if (lot) out += `(10)${lot}`;
  if (qty) out += `(37)${qty}`;
  return out;
}

export function buildSscc(companyPrefix: string, serial: number) {
  const body = ("0" + companyPrefix + String(serial).padStart(16 - companyPrefix.length, "0")).slice(0, 17);
  return body + checkDigit(body);
}

/** Producto a partir del GTIN-14 (o EAN-13 si el GTIN trae indicador 0). */
export const eanFromGtin = (gtin: string) => (gtin.length === 14 && gtin.startsWith("0") ? gtin.slice(1) : gtin);
