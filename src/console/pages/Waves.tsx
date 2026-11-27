import { useMemo, useState } from "react";
import { Waves as WavesIcon, AlertTriangle } from "lucide-react";
import { previewWave } from "../../core/engine";
import { useStore, can, whyNot } from "../../core/store";
import { Avatar, Button, Card, Code, Empty, Pill, Progress, useToast } from "../../ui/kit";
import { ago, dateTime, STATUS } from "../../ui/format";
import { useConsole } from "../ctx";
import type { PickMode } from "../../core/types";

const MODE: Record<PickMode, { label: string; short: string; desc: string }> = {
  pedido: { label: "Por pedido", short: "por pedido", desc: "Una tarea por pedido. Simple, pero repite recorridos." },
  lote: { label: "Por lote", short: "por lote", desc: "Un carro con un contenedor por pedido; una sola ruta surte varios pedidos." },
  zona: { label: "Por zona", short: "por zona", desc: "Una tarea por zona (A, B, C); cada operario cubre su zona y los pedidos se consolidan en empaque." },
};

export function Waves() {
  const { state, dispatch } = useStore();
  const { inspect, user } = useConsole();
  const toast = useToast();
  const pending = state.orders.filter((o) => o.stage === "nuevo").sort((a, b) => a.due - b.due);
  const [carrier, setCarrier] = useState("");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const visible = pending.filter((o) => (!carrier || o.carrier === carrier) && (!onlyHigh || o.priority === "alta"));
  const [sel, setSel] = useState<Set<string>>(() => new Set(pending.filter((o) => o.due < Date.now() + 8 * 3_600_000).map((o) => o.id)));
  const chosen = visible.filter((o) => sel.has(o.id)).map((o) => o.id);
  const [mode, setMode] = useState<PickMode>("lote");
  const [batch, setBatch] = useState(4);
  const pv = useMemo(() => previewWave(state, chosen, mode, batch), [state, chosen.join(), mode, batch]);
  const base = pv.compare.find((c) => c.mode === "pedido")!;
  const criteria = [carrier || "Todos los transportistas", onlyHigh ? "solo prioridad alta" : null, `${chosen.length} pedidos`, MODE[mode].short].filter(Boolean).join(" · ");
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Planeación de oleadas</h1>
          <p className="muted">Agrupa pedidos por corte, transportista o prioridad. Revisa la vista previa antes de liberar: cuántas tareas genera y a quién.</p>
        </div>
      </div>

      <div className="grid-2-1">
        <Card pad={false} title={`Pedidos por liberar (${pending.length})`}>
          <div className="toolbar">
            <select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} aria-label="Transportista">
              <option value="">Todos los transportistas</option>
              {["Estafeta", "DHL", "FedEx", "99 Minutos"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={onlyHigh} onChange={(e) => setOnlyHigh(e.target.checked)} /> Solo prioridad alta</label>
            <div className="grow" />
            <button className="link" onClick={() => setSel(new Set(visible.map((o) => o.id)))}>Seleccionar todos</button>
            <button className="link" onClick={() => setSel(new Set())}>Ninguno</button>
          </div>
          {visible.length ? (
            <table className="tbl">
              <thead><tr><th style={{ width: 32 }}></th><th>Pedido</th><th>Cliente</th><th>Transportista</th><th className="r">Unid.</th><th>Compromiso</th></tr></thead>
              <tbody>{visible.map((o) => (
                <tr key={o.id} className={`clickable ${sel.has(o.id) ? "selected" : ""}`} onClick={() => toggle(o.id)}>
                  <td><input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} onClick={(e) => e.stopPropagation()} aria-label={`Incluir ${o.id}`} /></td>
                  <td><Code onClick={() => inspect({ kind: "pedido", id: o.id })}>{o.id}</Code>{o.priority === "alta" && <Pill tone="warn" dot={false}>Alta</Pill>}</td>
                  <td>{o.customer}</td>
                  <td>{o.carrier}</td>
                  <td className="r mono">{o.lines.reduce((s, l) => s + l.qty, 0)}</td>
                  <td className={o.due < Date.now() ? "t-blocked" : "muted"}>{ago(o.due)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Empty icon={<WavesIcon size={28} />} title="No hay pedidos por liberar">Cuando lleguen pedidos de Shopify, Amazon, Mercado Libre o B2B aparecerán aquí.</Empty>}
        </Card>

        <Card title="Vista previa de la oleada" className="sticky">
          <div className="field">Modo de surtido
            <div className="seg full" role="radiogroup" aria-label="Modo de surtido">
              {(Object.keys(MODE) as PickMode[]).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{MODE[m].label}</button>
              ))}
            </div>
            <span className="small muted">{MODE[mode].desc}</span>
          </div>
          {mode === "lote" && (
            <label className="field">Contenedores por carro
              <select className="input" value={batch} onChange={(e) => setBatch(Number(e.target.value))}>{[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} pedidos por carro</option>)}</select>
            </label>
          )}
          <div className="preview-grid">
            <div><strong>{pv.tasks}</strong><span>tareas de surtido</span></div>
            <div><strong>{pv.lines}</strong><span>líneas</span></div>
            <div><strong>{pv.units}</strong><span>unidades</span></div>
            <div><strong>{pv.stops}</strong><span>paradas en ruta</span></div>
          </div>
          <table className="tbl compact compare" aria-label="Comparación de modos de surtido">
            <thead><tr><th>Modo</th><th className="r">Tareas</th><th className="r">Paradas</th><th className="r">Recorrido</th></tr></thead>
            <tbody>{pv.compare.map((c) => (
              <tr key={c.mode} className={c.mode === mode ? "selected" : ""}>
                <td>{MODE[c.mode].label}{c.mode === mode && <span className="sr-only"> (seleccionado)</span>}</td>
                <td className="r mono">{c.tasks}</td><td className="r mono">{c.stops}</td>
                <td className="r mono">~{c.meters} m{c.mode !== "pedido" && base.meters > 0 && <span className={c.meters < base.meters ? "t-done" : "t-warn"}> {c.meters <= base.meters ? "−" : "+"}{Math.abs(Math.round((1 - c.meters / base.meters) * 100))}%</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="small muted">Recorrido estimado desde y hacia PACK-01; cambiar de pasillo obliga a volver al frente.</div>
          <div className="muted small">Remoción <strong>{state.rules.removal}</strong> · ruta en serpentina por pasillo</div>
          {pv.shortages.length > 0 && (
            <div className="banner tone-warn">
              <AlertTriangle size={16} />
              <div>
                <strong>{pv.shortLines} línea(s) sin existencia suficiente</strong>
                {pv.shortages.map((s) => <div key={s.order + s.sku} className="small">{s.order}: faltan {s.short} × {s.sku}</div>)}
                <div className="small muted">Se liberarán parciales y quedarán como excepción.</div>
              </div>
            </div>
          )}
          <h4 className="sec">Asignación propuesta</h4>
          {pv.assignment.map((a) => (
            <div key={a.user.id} className="row between assign-row">
              <span className="row gap-2"><Avatar initials={a.user.initials} />{a.user.name}</span>
              <span className="mono">{a.tasks} tarea(s)</span>
            </div>
          ))}
          <Button variant="primary" className="block" disabled={!chosen.length}
            disabledReason={can(user.role, "wave.release") ? undefined : whyNot("wave.release")}
            onClick={() => {
              dispatch({ type: "RELEASE_WAVE", orders: chosen, criteria, user: user.id, mode, batchSize: batch });
              toast(`Oleada liberada: ${pv.tasks} tareas enviadas a los handhelds`);
              setSel(new Set());
            }}>
            Liberar oleada ({chosen.length})
          </Button>
        </Card>
      </div>

      <Card title="Historial de oleadas" pad={false}>
        <table className="tbl">
          <thead><tr><th>Oleada</th><th>Criterio</th><th>Creada</th><th>Avance</th><th>Estado</th></tr></thead>
          <tbody>{state.waves.map((w) => {
            const orders = state.orders.filter((o) => o.wave === w.id);
            const shipped = orders.filter((o) => o.stage === "enviado").length;
            const status = shipped === orders.length ? "completo" : w.status;
            return (
              <tr key={w.id}>
                <td><Code>{w.id}</Code></td>
                <td>{w.criteria}<div className="chips small">{orders.map((o) => <button key={o.id} className="chip mono" onClick={() => inspect({ kind: "pedido", id: o.id })}>{o.id}</button>)}</div></td>
                <td className="muted">{dateTime(w.createdAt)}<div className="small">{state.users.find((u) => u.id === w.createdBy)?.name}</div></td>
                <td style={{ minWidth: 140 }}><Progress value={shipped / Math.max(1, orders.length)} tone="done" /><div className="small muted">{shipped}/{orders.length} enviados</div></td>
                <td><Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill></td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
    </div>
  );
}
