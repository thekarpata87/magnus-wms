import { useMemo } from "react";
import { alerts, kpis } from "../../core/engine";
import { useStore } from "../../core/store";
import { Card, Pill } from "../../ui/kit";
import { num, pct } from "../../ui/format";
import { useConsole } from "../ctx";

export function Reports() {
  const { state } = useStore();
  const { inspect } = useConsole();
  const k = useMemo(() => kpis(state), [state]);
  const al = useMemo(() => alerts(state), [state]);

  const rows: { kpi: string; what: string; calc: string; value: string; target: string; ok: boolean | null }[] = [
    { kpi: "Exactitud de picking", what: "Pedidos surtidos sin error", calc: "Líneas correctas ÷ líneas surtidas", value: pct(k.pickAccuracy), target: "> 99.5 %", ok: k.pickAccuracy > 0.995 },
    { kpi: "Exactitud de inventario", what: "Sistema vs. físico", calc: "Ubicaciones sin diferencia ÷ contadas", value: pct(k.invAccuracy), target: "> 98 %", ok: k.invAccuracy > 0.98 },
    { kpi: "Tasa de quiebre de stock", what: "Pedidos sin existencia", calc: "Líneas sin stock ÷ líneas pedidas", value: pct(k.stockout), target: "< 2 %", ok: k.stockout < 0.02 },
    { kpi: "Tiempo de surtido", what: "Velocidad de salida", calc: "Envío − liberación", value: `${k.fulfillHours.toFixed(1)} h`, target: "< 24 h", ok: k.fulfillHours < 24 },
    { kpi: "Líneas por hora", what: "Productividad por operario", calc: "Líneas surtidas ÷ horas (8 h)", value: k.linesPerHour.toFixed(1), target: "Depende del layout", ok: null },
    { kpi: "Dock-to-stock", what: "Rapidez de recepción", calc: "Última ubicación − llegada", value: `${k.dockToStock.toFixed(1)} h`, target: "Depende del volumen", ok: null },
    { kpi: "Espera en patio", what: "Coordinación de andenes", calc: "Asignación de puerta − llegada", value: `${k.yardWaitMin.toFixed(0)} min`, target: "< 30 min", ok: k.yardWaitMin < 30 },
    { kpi: "Tasa de devolución", what: "Logística inversa", calc: "Unidades en RMA ÷ unidades enviadas", value: pct(k.returnRate), target: "Depende del canal", ok: null },
    { kpi: "Ocupación del almacén", what: "Uso del espacio", calc: "Ubicaciones ocupadas ÷ totales", value: pct(k.occupancy, 0), target: "Depende de la estrategia", ok: null },
  ];

  const ops = state.users.filter((u) => u.role === "operario" || u.role === "empacador");
  const prod = ops.map((u) => {
    const mv = state.movements.filter((m) => m.user === u.id);
    return { u, picks: mv.filter((m) => m.type === "surtido").length, puts: mv.filter((m) => m.type === "ubicacion").length,
      rec: mv.filter((m) => m.type === "recepcion").length, pack: mv.filter((m) => m.type === "empaque").length };
  });
  const diffs = state.counts.flatMap((c) => c.lines.filter((l) => l.counted !== undefined && l.counted !== l.expected).map((l) => ({ c, l })));

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Reportes y KPIs</h1>
          <p className="muted">Calculados directamente de los movimientos, sin hojas de cálculo. Metas de referencia de la investigación.</p>
        </div>
      </div>
      <Card pad={false} title="Indicadores clave">
        <table className="tbl">
          <thead><tr><th>KPI</th><th>Qué mide</th><th>Cálculo</th><th className="r">Actual</th><th>Meta</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.kpi}>
              <td><strong>{r.kpi}</strong></td><td className="muted">{r.what}</td><td className="muted small">{r.calc}</td>
              <td className="r mono"><strong>{r.value}</strong></td><td className="muted">{r.target}</td>
              <td>{r.ok === null ? <Pill tone="neutral" dot={false}>Referencia</Pill> : r.ok ? <Pill tone="done">En meta</Pill> : <Pill tone="warn">Fuera de meta</Pill>}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <div className="grid-2">
        <Card pad={false} title="Productividad por usuario (histórico)">
          <table className="tbl compact">
            <thead><tr><th>Usuario</th><th className="r">Recepción</th><th className="r">Ubicación</th><th className="r">Surtido</th><th className="r">Empaque</th></tr></thead>
            <tbody>{prod.map(({ u, ...n }) => (
              <tr key={u.id} className="clickable" onClick={() => inspect({ kind: "usuario", id: u.id })}>
                <td>{u.name}</td><td className="r mono">{n.rec}</td><td className="r mono">{n.puts}</td><td className="r mono">{n.picks}</td><td className="r mono">{n.pack}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card pad={false} title="Antigüedad y caducidad (≤ 30 días)">
          <table className="tbl compact">
            <thead><tr><th>Lote</th><th>SKU</th><th>Caduca</th><th className="r">Pzas</th></tr></thead>
            <tbody>
              {al.expiring.map(({ lot, qty }) => (
                <tr key={lot.code} className="clickable" onClick={() => inspect({ kind: "lote", id: lot.code })}>
                  <td className="mono">{lot.code}</td><td className="mono">{lot.sku}</td><td className="t-warn">{lot.expiryDate}</td><td className="r mono">{num(qty)}</td>
                </tr>
              ))}
              {!al.expiring.length && <tr><td colSpan={4} className="muted">Sin lotes próximos a caducar.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
      <Card pad={false} title="Diferencias de conteo">
        <table className="tbl compact">
          <thead><tr><th>Conteo</th><th>Ubicación</th><th>SKU</th><th className="r">Sistema</th><th className="r">Físico</th><th className="r">Dif.</th><th>Estado</th></tr></thead>
          <tbody>
            {diffs.map(({ c, l }, i) => (
              <tr key={i}>
                <td className="mono">{c.id}</td><td className="mono">{l.location}</td><td className="mono">{l.sku ?? "—"}</td>
                <td className="r mono">{l.expected}</td><td className="r mono">{l.counted}</td><td className="r mono t-blocked">{(l.counted ?? 0) - l.expected}</td>
                <td>{c.status === "completo" ? <Pill tone="done">Ajustado</Pill> : <Pill tone="warn">Por aprobar</Pill>}</td>
              </tr>
            ))}
            {!diffs.length && <tr><td colSpan={7} className="muted">Sin diferencias.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
