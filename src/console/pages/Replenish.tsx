import { useMemo, useState } from "react";
import { RefreshCw, ShoppingCart, Zap } from "lucide-react";
import { purchasePlan, replenishPlan } from "../../core/engine";
import { useStore, can, whyNot } from "../../core/store";
import { Button, Card, Code, Pill, Stat, Tabs, useToast } from "../../ui/kit";
import { num, type Tone } from "../../ui/format";
import { useConsole } from "../ctx";

const ST: Record<string, { label: string; tone: Tone }> = {
  urgente: { label: "Urgente: surtidos sin cubrir", tone: "blocked" },
  bajo: { label: "Bajo mínimo", tone: "warn" },
  sin_espacio: { label: "Bajo mínimo · sin espacio", tone: "warn" },
  en_curso: { label: "Reabasto en curso", tone: "progress" },
  ok: { label: "En rango", tone: "done" },
};

export function Replenish() {
  const { state } = useStore();
  const [tab, setTab] = useState<"picking" | "compras">("picking");
  const { bal } = useStore();
  const rp = useMemo(() => replenishPlan(state, bal), [state, bal]);
  const pp = useMemo(() => purchasePlan(state, bal), [state, bal]);
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Reabasto min/max</h1>
          <p className="muted">Dos niveles: mover de reserva (niveles 2–3) a la ubicación de picking (nivel 1) cuando baja de su mínimo, y comprar cuando la posición total cae al punto de reorden.</p>
        </div>
        <Tabs value={tab} onChange={setTab} items={[
          { id: "picking", label: "Ubicaciones de picking", count: rp.filter((x) => x.need > 0 || x.status === "urgente").length || undefined },
          { id: "compras", label: "Compras sugeridas", count: pp.filter((x) => x.reorder).length || undefined },
        ]} />
      </div>
      {tab === "picking" ? <PickFaces plan={rp} /> : <Purchases plan={pp} />}
    </div>
  );
}

function PickFaces({ plan }: { plan: ReturnType<typeof replenishPlan> }) {
  const { state, dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const actionable = plan.filter((x) => x.need > 0 && x.sources.length);
  const [sel, setSel] = useState<Set<string>>(() => new Set(actionable.map((x) => x.product.sku)));
  const chosen = actionable.filter((x) => sel.has(x.product.sku));
  const tasks = chosen.reduce((n, x) => n + x.sources.length, 0);
  const units = chosen.reduce((n, x) => n + x.sources.reduce((m, s) => m + s.qty, 0), 0);
  const open = state.tasks.filter((t) => t.type === "reabastecer" && t.status !== "completo");
  const reason = can(user.role, "replenish.manage") ? undefined : whyNot("replenish.manage");
  const toggle = (sku: string) => setSel((s) => { const n = new Set(s); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });

  return (
    <>
      <div className="grid-kpi four">
        <Stat label="Bajo mínimo" value={plan.filter((x) => ["bajo", "urgente", "sin_espacio"].includes(x.status)).length} tone={plan.some((x) => x.status === "urgente") ? "warn" : undefined} hint={`de ${plan.length} ubicaciones de picking`} />
        <Stat label="Urgentes" value={plan.filter((x) => x.status === "urgente").length} hint="Surtidos reservados sin piezas libres" />
        <Stat label="Tareas de reabasto abiertas" value={open.length} hint={`${num(open.reduce((n, t) => n + (t.qty ?? 0), 0))} pzas en movimiento`} />
        <Stat label="Modo" value={state.rules.autoReplenish ? "Automático" : "Manual"} hint={state.rules.autoReplenish ? "Se generan al surtir y al liberar oleadas" : "Actívalo en Reglas"} />
      </div>
      <Card pad={false} title="Ubicaciones de picking" actions={<>
        <span className="muted small">{tasks} tarea(s) · {num(units)} pzas</span>
        <Button variant="primary" icon={<RefreshCw size={15} aria-hidden />} disabled={!tasks} disabledReason={reason}
          onClick={() => { dispatch({ type: "GENERATE_REPLENISH", skus: chosen.map((x) => x.product.sku), user: user.id }); toast(`${tasks} tarea(s) de reabasto enviadas al handheld`); setSel(new Set()); }}>
          Generar reabasto
        </Button></>}>
        <table className="tbl">
          <thead><tr><th style={{ width: 32 }}></th><th>Producto</th><th>Ubicación</th><th style={{ width: 200 }}>Existencia vs. mín / máx</th><th className="r">Reservado</th><th>Origen sugerido (reserva)</th><th>Estado</th></tr></thead>
          <tbody>{plan.map((x) => {
            const can2 = x.need > 0 && x.sources.length > 0;
            const pct = Math.min(1, x.qty / x.max);
            return (
              <tr key={x.product.sku} className={sel.has(x.product.sku) ? "selected" : ""}>
                <td>{can2 && <input type="checkbox" checked={sel.has(x.product.sku)} onChange={() => toggle(x.product.sku)} aria-label={`Incluir ${x.product.sku}`} />}</td>
                <td><button className="link" onClick={() => inspect({ kind: "producto", id: x.product.sku })}>{x.product.emoji} {x.product.name}</button><div className="mono muted small">{x.product.sku}</div></td>
                <td><Code onClick={() => inspect({ kind: "ubicacion", id: x.loc! })}>{x.loc}</Code></td>
                <td>
                  <div className="minmax" role="img" aria-label={`${x.qty} piezas; mínimo ${x.min}, máximo ${x.max}`}>
                    <div className={`minmax-fill ${x.free < x.min ? "low" : ""}`} style={{ width: `${pct * 100}%` }} />
                    <i className="minmax-min" style={{ left: `${(x.min / x.max) * 100}%` }} />
                  </div>
                  <div className="small muted">{num(x.qty)} pzas · mín {x.min} · máx {x.max}{x.incoming ? ` · +${x.incoming} en camino` : ""}</div>
                </td>
                <td className={`r mono ${x.reserved > x.qty ? "t-blocked" : x.reserved ? "" : "muted"}`}>{x.reserved || "—"}</td>
                <td>{x.sources.map((s) => <div key={s.loc + s.lot} className="small mono">{s.qty} × {s.lot ?? "s/lote"} · {s.loc}</div>)}
                  {x.need > 0 && x.short > 0 && <Pill tone="warn">Reserva insuficiente: faltan {x.short}</Pill>}
                  {!x.need && <span className="muted small">—</span>}</td>
                <td><Pill tone={ST[x.status].tone}>{ST[x.status].label}</Pill></td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
    </>
  );
}

function Purchases({ plan }: { plan: ReturnType<typeof purchasePlan> }) {
  const { dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const reason = can(user.role, "po.create") ? undefined : whyNot("po.create");
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(plan.filter((x) => x.reorder).map((x) => [x.product.sku, x.suggested])));
  const [all, setAll] = useState(false);
  const bySupplier = new Map<string, typeof plan>();
  for (const x of plan) if (all || x.reorder || qty[x.product.sku]) bySupplier.set(x.supplier, [...(bySupplier.get(x.supplier) ?? []), x]);

  return (
    <>
      <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Mostrar todos los productos (armar una OC manual)</label>
      <p className="muted small">Punto de reorden = mínimo del SKU. Se sugiere llegar al máximo considerando lo que ya viene en órdenes abiertas, redondeado a caja completa. La demanda es el promedio diario surtido en 7 días.</p>
      {[...bySupplier.entries()].map(([supplier, rows]) => {
        const lines = rows.map((x) => ({ sku: x.product.sku, qty: qty[x.product.sku] ?? 0 })).filter((l) => l.qty > 0);
        return (
          <Card key={supplier} title={<span className="row gap-2"><ShoppingCart size={16} aria-hidden />{supplier}</span>} pad={false}
            actions={<Button variant="primary" disabled={!lines.length} disabledReason={reason}
              onClick={() => { dispatch({ type: "CREATE_PO", supplier, lines, user: user.id }); toast(`Orden de compra creada para ${supplier}; aparece en Entradas`); setQty((q) => { const n = { ...q }; lines.forEach((l) => delete n[l.sku]); return n; }); }}>
              Crear OC ({lines.reduce((n, l) => n + l.qty, 0)} pzas)</Button>}>
            <table className="tbl">
              <thead><tr><th>Producto</th><th className="r">Disponible</th><th className="r">En tránsito</th><th className="r">Mín / Máx</th><th className="r">Demanda/día</th><th className="r">Cobertura</th><th className="r">Pedir</th></tr></thead>
              <tbody>{rows.map((x) => (
                <tr key={x.product.sku}>
                  <td><button className="link" onClick={() => inspect({ kind: "producto", id: x.product.sku })}>{x.product.emoji} {x.product.name}</button><div className="mono muted small">{x.product.sku} · caja ×{x.box}</div></td>
                  <td className={`r mono ${x.available < x.product.min ? "t-warn" : ""}`}>{num(x.available)}</td>
                  <td className="r mono muted">{x.inbound || "—"}</td>
                  <td className="r mono">{x.product.min} / {x.product.max}</td>
                  <td className="r mono">{x.demand ? x.demand.toFixed(1) : "—"}</td>
                  <td className={`r mono ${x.cover < 3 ? "t-blocked" : ""}`}>{x.cover === Infinity ? "—" : `${x.cover.toFixed(1)} d`}</td>
                  <td className="r"><input className="input sm num" type="number" min={0} step={x.box} value={qty[x.product.sku] ?? 0}
                    onChange={(e) => setQty({ ...qty, [x.product.sku]: Math.max(0, Number(e.target.value)) })} aria-label={`Cantidad a pedir de ${x.product.sku}`} />
                    {x.reorder && <div className="small muted">sugerido {x.suggested}</div>}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        );
      })}
      {!bySupplier.size && !all && <Card><div className="empty"><Zap size={28} aria-hidden /><strong>Ningún SKU en punto de reorden</strong><p>La posición (disponible + en tránsito) de todos los productos está por encima de su mínimo.</p></div></Card>}
    </>
  );
}
