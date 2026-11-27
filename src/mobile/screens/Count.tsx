import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useStore } from "../../core/store";
import { QtyPad, ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

export function CountList() {
  const { state } = useStore();
  const nav = useNavigate();
  const open = state.tasks.filter((t) => t.type === "contar" && t.status !== "completo");
  return (
    <TaskScreen title="Contar" context="Conteo cíclico sin detener la operación">
      <div className="hh-list">
        {open.map((t) => {
          const c = state.counts.find((x) => x.id === t.doc);
          return (
            <button key={t.id} className="hh-row" onClick={() => nav(`/handheld/contar/${t.id}`)}>
              <span><strong>{t.doc}</strong><small>{c?.reason} · {t.locations?.join(", ")}</small></span>
              <em>{t.locations?.length}</em>
            </button>
          );
        })}
        {!open.length && <div className="hh-empty">No hay conteos pendientes.</div>}
      </div>
    </TaskScreen>
  );
}

export function CountFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const task = state.tasks.find((t) => t.id === id);
  const count = state.counts.find((c) => c.id === task?.doc);
  const [locIdx, setLocIdx] = useState(0);
  const [scanned, setScanned] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const [qty, setQty] = useState(0);
  const [values, setValues] = useState<Record<number, number>>({});
  const [sent, setSent] = useState(false);
  if (!task || !count) return <TaskScreen title="Contar"><p>Conteo no encontrado.</p></TaskScreen>;

  const locs = task.locations ?? [];
  const loc = locs[locIdx];
  const linesHere = count.lines.map((l, i) => ({ l, i })).filter((x) => x.l.location === loc);
  const cur = linesHere[lineIdx];

  if (sent || !loc) {
    return (
      <TaskScreen title="Conteo enviado" context={count.id} progress={[locs.length, locs.length]}
        primary={<button className="hh-primary" onClick={() => nav("/handheld")}>Volver al inicio</button>}>
        <div className="hh-done"><CheckCircle2 size={72} /><strong>Gracias</strong><span>Si hay diferencias, el supervisor las revisará antes de ajustar.</span></div>
      </TaskScreen>
    );
  }

  const p = cur?.l.sku ? state.products.find((x) => x.sku === cur.l.sku) : undefined;

  const save = () => {
    const nv = { ...values, [cur.i]: qty };
    setValues(nv);
    fb(true, "Registrado");
    setQty(0);
    if (lineIdx + 1 < linesHere.length) return setLineIdx(lineIdx + 1);
    if (locIdx + 1 < locs.length) { setLocIdx(locIdx + 1); setLineIdx(0); setScanned(false); return; }
    dispatch({ type: "SUBMIT_COUNT", count: count.id, values: nv, user: user.id, device: "Handheld" });
    setSent(true);
  };

  return (
    <TaskScreen title={`Contar ${count.id}`} context={count.blind ? "Conteo a ciegas" : "Conteo informado"} progress={[locIdx, locs.length]} back="/handheld/contar"
      primary={scanned ? <button className="hh-primary" onClick={save}>Guardar {qty} pzas</button> : undefined}>
      <Steps items={["Escanear ubicación", "Contar"]} current={scanned ? 1 : 0} />
      {!scanned ? <>
        <div className="hh-instr big"><span>Ve a</span><strong className="mono">{loc}</strong></div>
        <ScanField placeholder="Escanea la ubicación" onScan={(c) => {
          if (c !== loc) return fb(false, `Debes contar ${loc}`);
          fb(true, loc);
          dispatch({ type: "START_TASK", task: task.id, user: user.id, device: "Handheld" });
          setScanned(true);
        }} simulate={[{ label: loc, code: loc }]} />
      </> : <>
        {p ? (
          <div className="hh-product xl">
            <span className="hh-photo">{p.emoji}</span>
            <div><strong>{p.name}</strong><span className="mono">{p.sku}{cur.l.lot && ` · lote ${cur.l.lot}`}</span>
              {!count.blind && <span>Sistema: {cur.l.expected}</span>}</div>
          </div>
        ) : <div className="hh-instr"><span>Ubicación registrada como vacía</span><strong>¿Encontraste producto?</strong></div>}
        <QtyPad value={qty} onChange={setQty} />
      </>}
    </TaskScreen>
  );
}
