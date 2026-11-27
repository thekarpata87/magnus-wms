import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { RETURN_DOCK } from "../../core/engine";
import { useStore } from "../../core/store";
import type { Condition, Disposition } from "../../core/types";
import { QtyPad, ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

const CONDS: { id: Condition; label: string; desc: string; suggest: Disposition }[] = [
  { id: "buena", label: "Buena", desc: "Empaque íntegro, se puede vender", suggest: "reubicar" },
  { id: "defectuosa", label: "Defectuosa", desc: "No funciona o falla de fábrica", suggest: "cuarentena" },
  { id: "danada", label: "Dañada", desc: "Rota, mojada o incompleta", suggest: "desechar" },
];
const DISPS: { id: Disposition; label: string; dest: string }[] = [
  { id: "reubicar", label: "Reubicar a stock", dest: `Deja en ${RETURN_DOCK}; se genera tarea de ubicación` },
  { id: "cuarentena", label: "Cuarentena", dest: "Lleva a QUA-01 para revisión del proveedor" },
  { id: "desechar", label: "Desechar", dest: "Contenedor de merma; sale del inventario" },
];

export function ReturnList() {
  const { state } = useStore();
  const nav = useNavigate();
  const fb = useFeedback();
  const open = state.rmas.filter((r) => r.lines.some((l) => l.received < l.qty) && r.status !== "completo");
  return (
    <TaskScreen title="Devolver" context="Escanea la etiqueta de retorno (RMA) o el pedido">
      <ScanField placeholder="Escanea RMA o pedido" onScan={(c) => {
        const r = open.find((x) => x.id === c || x.order === c);
        if (r) { fb(true, r.id); nav(`/handheld/devolver/${r.id}`); }
        else fb(false, state.rmas.some((x) => x.id === c || x.order === c) ? "Esa devolución ya se recibió" : "Sin autorización de devolución: no aceptar el paquete");
      }} simulate={[...open.slice(0, 2).map((r) => ({ label: r.id, code: r.id, wrong: false })), { label: "Paquete sin RMA", code: "PED-5004", wrong: true }]} />
      <div className="hh-list">
        {open.map((r) => (
          <button key={r.id} className="hh-row" onClick={() => nav(`/handheld/devolver/${r.id}`)}>
            <span><strong>{r.id} · {r.customer}</strong><small>{r.order} · {r.reason}</small></span>
            <em>{r.lines.reduce((n, l) => n + l.received, 0)}/{r.lines.reduce((n, l) => n + l.qty, 0)}</em>
          </button>
        ))}
        {!open.length && <div className="hh-empty">No hay devoluciones autorizadas por recibir.</div>}
      </div>
    </TaskScreen>
  );
}

export function ReturnFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const r = state.rmas.find((x) => x.id === id);
  const [received, setReceived] = useState<Record<string, number>>(() => Object.fromEntries(r?.lines.map((l) => [l.sku, l.received]) ?? []));
  const [sku, setSku] = useState<string | null>(null);
  const [cond, setCond] = useState<Condition | null>(null);
  const [disp, setDisp] = useState<Disposition | null>(null);
  const [qty, setQty] = useState(1);
  if (!r) return <TaskScreen title="Devolver"><p>RMA no encontrada.</p></TaskScreen>;

  const total = r.lines.reduce((n, l) => n + l.qty, 0);
  const got = Object.values(received).reduce((a, b) => a + b, 0);
  const line = r.lines.find((l) => l.sku === sku);
  const p = state.products.find((x) => x.sku === sku);
  const left = line ? line.qty - received[line.sku] : 0;
  const nextLine = r.lines.find((l) => received[l.sku] < l.qty);
  const phase = !sku ? 0 : !cond ? 1 : 2;
  const heldLot = !!(line?.lot && state.lots.find((x) => x.code === line.lot)?.hold);

  if (!nextLine && !sku) {
    return (
      <TaskScreen title={`Devolución ${r.id}`} context={r.customer} progress={[got, total]}
        primary={<button className="hh-primary" onClick={() => nav("/handheld")}>Terminar</button>}>
        <div className="hh-done"><Printer size={64} /><strong>Devolución recibida</strong><span>El supervisor emitirá la nota de crédito al cliente.</span></div>
      </TaskScreen>
    );
  }

  const confirm = () => {
    if (!line || !cond || !disp || qty <= 0) return;
    dispatch({ type: "RECEIVE_RETURN", rma: r.id, sku: line.sku, qty: Math.min(qty, left), condition: cond, disposition: disp, user: user.id, device: "Handheld" });
    setReceived((x) => ({ ...x, [line.sku]: x[line.sku] + Math.min(qty, left) }));
    fb(true, disp === "reubicar" ? `Etiqueta impresa · deja en ${RETURN_DOCK}` : disp === "cuarentena" ? "Etiqueta CUARENTENA · lleva a QUA-01" : "Registrado como merma");
    setSku(null); setCond(null); setDisp(null);
  };

  return (
    <TaskScreen title={`Devolución ${r.id}`} context={`${r.order} · ${r.reason}`} progress={[got, total]} back="/handheld/devolver"
      primary={phase === 2 ? <button className="hh-primary" onClick={confirm} disabled={!disp}><Printer size={22} /> Confirmar {Math.min(qty, left)} pzas</button> : undefined}
      secondary={sku ? <button className="hh-ghost" onClick={() => { setSku(null); setCond(null); setDisp(null); }}>Otro artículo</button> : undefined}>
      <Steps items={["Escanear artículo", "Inspección", "Disposición"]} current={phase} />
      {!sku ? <>
        <div className="hh-instr"><span>Abre el paquete y escanea</span><strong>{state.products.find((x) => x.sku === nextLine!.sku)?.name}</strong></div>
        <ScanField placeholder="Escanea el artículo devuelto" onScan={(c) => {
          const prod = state.products.find((x) => x.barcode === c || x.sku === c);
          const l = prod && r.lines.find((x) => x.sku === prod.sku);
          if (!prod || !l) return fb(false, "Ese artículo no está autorizado en esta RMA");
          if (received[l.sku] >= l.qty) return fb(false, `Ya recibiste los ${l.qty} autorizados`);
          fb(true, prod.name); setSku(prod.sku); setQty(l.qty - received[l.sku]);
        }} simulate={[{ label: "Artículo autorizado", code: state.products.find((x) => x.sku === nextLine!.sku)!.barcode }, { label: "Artículo no autorizado", code: state.products.find((x) => x.sku === "TOR-14")!.barcode, wrong: true }]} />
        <div className="hh-list">{r.lines.map((l) => {
          const pr = state.products.find((x) => x.sku === l.sku)!;
          return <div key={l.sku} className={`hh-row static ${received[l.sku] >= l.qty ? "done" : ""}`}><span className="hh-emoji">{pr.emoji}</span><span><strong>{pr.name}</strong><small>{l.lot ? `lote ${l.lot}` : pr.sku}</small></span><em>{received[l.sku]}/{l.qty}</em></div>;
        })}</div>
      </> : <>
        <div className="hh-product"><span className="hh-photo">{p?.emoji}</span><div><strong>{p?.name}</strong><span>{left} pzas autorizadas{line?.lot && ` · lote ${line.lot}`}</span></div></div>
        {!cond ? <>
          <div className="hh-label">¿En qué condición llegó?</div>
          {CONDS.map((c) => (
            <button key={c.id} className={`hh-exc-big cond-${c.id}`} onClick={() => { setCond(c.id); setDisp(heldLot && c.suggest === "reubicar" ? "cuarentena" : c.suggest); }}>{c.label}<small>{c.desc}</small></button>
          ))}
        </> : <>
          <div className="hh-label">Disposición · sugerida para condición “{CONDS.find((c) => c.id === cond)?.label}”</div>
          {heldLot && <div className="hh-alert">Lote {line?.lot} retenido por recall: no puede volver a stock</div>}
          {DISPS.filter((d) => !(heldLot && d.id === "reubicar")).map((d) => (
            <button key={d.id} className={`hh-exc-big ${disp === d.id ? "on" : ""}`} onClick={() => setDisp(d.id)}>{d.label}<small>{d.dest}</small></button>
          ))}
          {left > 1 && <QtyPad value={qty} onChange={setQty} max={left} />}
        </>}
      </>}
    </TaskScreen>
  );
}
