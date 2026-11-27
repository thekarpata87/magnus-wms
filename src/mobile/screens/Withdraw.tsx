import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertOctagon } from "lucide-react";
import { parseGs1, eanFromGtin } from "../../core/gs1";
import { useStore } from "../../core/store";
import { QtyPad, ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

// Retiro por recall: llevar todo el lote retenido de su ubicación a cuarentena.
export function WithdrawFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const t = state.tasks.find((x) => x.id === id);
  const [phase, setPhase] = useState<"loc" | "item" | "qty" | "dest">("loc");
  const [qty, setQty] = useState(t?.qty ?? 0);
  if (!t) return <TaskScreen title="Retirar"><p>Tarea no encontrada.</p></TaskScreen>;
  const p = state.products.find((x) => x.sku === t.sku)!;
  const recall = state.recalls.find((r) => r.id === t.doc);
  const step = { loc: 0, item: 1, qty: 2, dest: 3 }[phase];

  const finish = () => {
    dispatch({ type: "CONFIRM_WITHDRAW", task: t.id, qty, user: user.id, device: "Handheld" });
    fb(true, `${qty} pzas en cuarentena`);
    const next = state.tasks.find((x) => x.type === "retirar" && x.status !== "completo" && x.id !== t.id);
    setTimeout(() => nav(next ? `/handheld/retirar/${next.id}` : "/handheld"), 700);
  };

  return (
    <TaskScreen title="Retiro por recall" context={`${t.doc} · ${recall?.reason ?? ""}`} back="/handheld"
      primary={phase === "qty" ? <button className="hh-primary danger" onClick={() => { setPhase("dest"); fb(true, "Cantidad registrada"); }}>Retirar {qty} pzas</button> : undefined}
      secondary={phase === "qty" && qty < (t.qty ?? 0) ? <span className="hh-muted small">Diferencia de {(t.qty ?? 0) - qty}: quedará en bitácora</span> : undefined}>
      <div className="hh-alert"><AlertOctagon size={22} /><span><strong>Lote {t.lot} RETENIDO</strong> · no surtir ni enviar</span></div>
      <Steps items={["Ir a ubicación", "Escanear lote", "Cantidad", "Cuarentena"]} current={step} />
      {phase === "loc" && <>
        <div className="hh-instr big"><span>Ve a</span><strong className="mono">{t.from}</strong><small>Retira {t.qty} × {p.name}</small></div>
        <ScanField placeholder="Escanea la ubicación" onScan={(c) => {
          if (c !== t.from) return fb(false, `Debes ir a ${t.from}`);
          fb(true, c);
          dispatch({ type: "START_TASK", task: t.id, user: user.id, device: "Handheld" });
          setPhase("item");
        }} simulate={[{ label: t.from!, code: t.from! }]} />
      </>}
      {phase !== "loc" && (
        <div className="hh-product xl">
          <span className="hh-photo">{p.emoji}</span>
          <div><strong>{p.name}</strong><span className="mono">{p.sku} · {t.from}</span><span>Lote <b className="hh-tag danger">{t.lot}</b></span></div>
        </div>
      )}
      {phase === "item" && <>
        <div className="hh-instr"><span>Escanea la etiqueta GS1 o el artículo y verifica el lote</span><strong>{t.lot}</strong></div>
        <ScanField placeholder="Escanea artículo o etiqueta GS1" onScan={(c) => {
          const gs = parseGs1(c);
          const code = gs?.gtin ? eanFromGtin(gs.gtin) : c;
          if (code !== p.barcode && code !== p.sku && c !== t.lot) return fb(false, "No es el artículo del recall");
          if (gs?.lot && gs.lot !== t.lot) return fb(false, `Lote ${gs.lot}: no está retenido, déjalo en el rack`);
          fb(true, `Lote ${t.lot} confirmado`);
          setPhase("qty");
        }} simulate={[{ label: "Artículo correcto", code: p.barcode }, { label: "Lote equivocado (GS1)", code: `(01)0${p.barcode}(10)OTRO123`, wrong: true }]} />
      </>}
      {phase === "qty" && <QtyPad value={qty} onChange={setQty} max={t.qty} />}
      {phase === "dest" && <>
        <div className="hh-instr big"><span>Lleva a cuarentena</span><strong className="mono">QUA-01</strong><small>Coloca etiqueta roja de RETENIDO</small></div>
        <ScanField placeholder="Escanea QUA-01" onScan={(c) => (c === "QUA-01" ? finish() : fb(false, "Solo puede ir a QUA-01"))}
          simulate={[{ label: "QUA-01", code: "QUA-01" }, { label: "Otra ubicación", code: "A-02-01-1", wrong: true }]} />
      </>}
    </TaskScreen>
  );
}
