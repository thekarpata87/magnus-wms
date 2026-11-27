import { useMemo, useState } from "react";
import { balancesOf, skuTotals } from "../../core/engine";
import { useStore } from "../../core/store";
import { Card, Code, Pill, Progress } from "../../ui/kit";
import { num } from "../../ui/format";
import { useConsole } from "../ctx";
import { Expiry } from "../Inspector";

export function Stock() {
  const { state, bal } = useStore();
  const { inspect } = useConsole();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const totals = useMemo(() => skuTotals(state, bal), [state, bal]);
  const cats = [...new Set(state.products.map((p) => p.category))];
  const rows = state.products.filter((p) =>
    (!q || (p.sku + p.name + p.barcode).toLowerCase().includes(q.toLowerCase())) &&
    (!cat || p.category === cat) && (!onlyLow || (totals.get(p.sku)?.available ?? 0) < p.min));

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Existencias</h1>
          <p className="muted">Saldos derivados de los movimientos (kardex). Disponible = en almacenaje − reservado por tareas de surtido.</p>
        </div>
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <input className="input" aria-label="Buscar producto por SKU, nombre o código de barras" placeholder="SKU, nombre o código de barras" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>{cats.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Bajo mínimo</label>
        </div>
        <table className="tbl">
          <thead><tr><th>Producto</th><th>ABC</th><th className="r">Existencia</th><th className="r">Reservado</th><th className="r">Disponible</th><th className="r">En proceso</th><th style={{ width: 160 }}>vs. mín / máx</th><th>Ubicaciones</th><th>Próx. caducidad</th></tr></thead>
          <tbody>{rows.map((p) => {
            const t = totals.get(p.sku)!;
            const locs = balancesOf(bal, p.sku).filter((b) => /^[ABC]-/.test(b.loc));
            const lots = locs.map((b) => state.lots.find((l) => l.code === b.lot)?.expiryDate).filter(Boolean).sort() as string[];
            const low = t.available < p.min;
            return (
              <tr key={p.sku} className="clickable" onClick={() => inspect({ kind: "producto", id: p.sku })}>
                <td><span className="row gap-2"><span className="emoji">{p.emoji}</span><span><strong>{p.name}</strong><div className="mono muted small">{p.sku}</div></span></span></td>
                <td><span className={`abc abc-${p.abc}`}>{p.abc}</span></td>
                <td className="r mono">{num(t.onHand)}</td>
                <td className="r mono muted">{t.reserved || "—"}</td>
                <td className={`r mono ${low ? "t-warn" : ""}`}><strong>{num(t.available)}</strong></td>
                <td className="r mono muted">{t.inProcess || "—"}</td>
                <td><Progress value={t.available / p.max} tone={low ? "warn" : "done"} /><div className="small muted">{low ? <span className="t-warn">Bajo mínimo ({p.min})</span> : `mín ${p.min} · máx ${p.max}`}</div></td>
                <td><div className="chips">{locs.slice(0, 3).map((b) => <span key={b.loc + b.lot} className="chip mono small">{b.loc}</span>)}{locs.length > 3 && <span className="muted small">+{locs.length - 3}</span>}</div></td>
                <td>{lots[0] ? <Expiry iso={lots[0]} /> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
    </div>
  );
}

export function Products() {
  const { state } = useStore();
  const { inspect } = useConsole();
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Productos</h1>
          <p className="muted">Maestro de SKU: unidades de medida con factor de conversión, códigos, peso y política de lote/caducidad.</p>
        </div>
      </div>
      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Categoría</th><th>EAN-13</th><th>Unidades</th><th className="r">Peso</th><th>Lote</th><th>Caducidad</th><th>Zona pref.</th><th>Mín / Máx</th></tr></thead>
          <tbody>{state.products.map((p) => (
            <tr key={p.sku} className="clickable" onClick={() => inspect({ kind: "producto", id: p.sku })}>
              <td><span className="row gap-2"><span className="emoji">{p.emoji}</span><span><strong>{p.name}</strong><div className="mono muted small">{p.sku}</div></span></span></td>
              <td>{p.category}</td>
              <td><Code>{p.barcode}</Code></td>
              <td className="small">{p.uom} · {p.packs.map((x) => `${x.uom} ×${x.factor}`).join(" · ")}</td>
              <td className="r mono">{p.weightKg} kg</td>
              <td>{p.lotTracked ? <Pill tone="brand" dot={false}>Sí</Pill> : <span className="muted">No</span>}</td>
              <td>{p.expiryTracked ? <Pill tone="brand" dot={false}>FEFO</Pill> : <span className="muted">No</span>}</td>
              <td className="mono">{p.preferredZone}</td>
              <td className="mono">{p.min} / {p.max}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
