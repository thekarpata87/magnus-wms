import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { eanFromGtin, parseGs1 } from "../../core/gs1";
import { useStore } from "../../core/store";
import { QtyPad, ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

export function ReplenishList() {
  const { state } = useStore();
  const nav = useNavigate();
  const open = state.tasks.filter((t) => t.type === "reabastecer" && t.status !== "completo").sort((a, b) => a.priority - b.priority);
  return (
    <TaskScreen title="Reabastecer" context="De reserva (niveles 2–3) a picking (nivel 1)">
      <div className="hh-list">
        {open.map((t) => {
          const p = state.products.find((x) => x.sku === t.sku)!;
          return (
            <button key={t.id} className="hh-row" onClick={() => nav(`/handheld/reabastecer/${t.id}`)}>
              <span className="hh-emoji" aria-hidden>{p.emoji}</span>
              <span><strong>{t.qty} × {p.name}{t.priority === 1 && " · urgente"}</strong><small>{t.from} → {t.suggested}</small></span>
              <em>{t.id.replace("TSK-", "#")}</em>
            </button>
          );
        })}
        {!open.length && <div className="hh-empty">Las ubicaciones de picking están en rango.</div>}
      </div>
    </TaskScreen>
  );
}

export function ReplenishFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const t = state.tasks.find((x) => x.id === id);
  const [phase, setPhase] = useState<"loc" | "item" | "qty" | "dest">("loc");
  const [qty, setQty] = useState(t?.qty ?? 0);
  if (!t) return <TaskScreen title="Reabastecer"><p>Tarea no encontrada.</p></TaskScreen>;
  const p = state.products.find((x) => x.sku === t.sku)!;
  const step = { loc: 0, item: 1, qty: 2, dest: 3 }[phase];

  const finish = () => {
    dispatch({ type: "CONFIRM_REPLENISH", task: t.id, qty, user: user.id, device: "Handheld" });
    fb(true, `${qty} pzas en ${t.suggested}`);
    const next = state.tasks.find((x) => x.type === "reabastecer" && x.status !== "completo" && x.id !== t.id);
    setTimeout(() => nav(next ? `/handheld/reabastecer/${next.id}` : "/handheld"), 700);
  };

  return (
    <TaskScreen title="Reabastecer picking" context={`${t.id}${t.priority === 1 ? " · urgente: hay surtidos esperando" : ""}`} back="/handheld/reabastecer"
      primary={phase === "qty" ? <button className="hh-primary" onClick={() => { setPhase("dest"); fb(true, "Cantidad registrada"); }}>Tomar {qty} pzas</button> : undefined}>
      <Steps items={["Ir a reserva", "Escanear lote", "Cantidad", "Dejar en picking"]} current={step} />
      {phase === "loc" && <>
        <div className="hh-instr big"><span>Ve a la reserva</span><strong className="mono">{t.from}</strong><small>Toma {t.qty} × {p.name} para {t.suggested}</small></div>
        <ScanField placeholder="Escanea la ubicación de reserva" onScan={(c) => {
          if (c !== t.from) return fb(false, `Debes ir a ${t.from}`);
          fb(true, c);
          dispatch({ type: "START_TASK", task: t.id, user: user.id, device: "Handheld" });
          setPhase("item");
        }} simulate={[{ label: t.from!, code: t.from! }]} />
      </>}
      {phase !== "loc" && (
        <div className="hh-product xl">
          <span className="hh-photo" aria-hidden>{p.emoji}</span>
          <div><strong>{p.name}</strong><span className="mono">{p.sku}{t.lot && ` · lote ${t.lot}`}</span><span>{t.from} → {t.suggested}</span></div>
        </div>
      )}
      {phase === "item" && <>
        <div className="hh-instr"><span>Escanea el artículo o la etiqueta GS1</span><strong>{t.lot ? `Lote ${t.lot}` : p.sku}</strong></div>
        <ScanField placeholder="Escanea artículo o etiqueta GS1" onScan={(c) => {
          const gs = parseGs1(c);
          const code = gs?.gtin ? eanFromGtin(gs.gtin) : c;
          if (code !== p.barcode && code !== p.sku) return fb(false, "No es el artículo de esta tarea");
          if (gs?.lot && t.lot && gs.lot !== t.lot) return fb(false, `Lote ${gs.lot}: toma el lote ${t.lot} (${state.rules.removal})`);
          fb(true, p.name);
          setPhase("qty");
        }} simulate={[{ label: "Artículo correcto", code: p.barcode }, ...(t.lot ? [{ label: "Otro lote (GS1)", code: `(01)0${p.barcode}(10)OTRO77`, wrong: true }] : [])]} />
      </>}
      {phase === "qty" && <QtyPad value={qty} onChange={setQty} max={t.qty} />}
      {phase === "dest" && <>
        <div className="hh-instr big"><span>Deja en la ubicación de picking</span><strong className="mono">{t.suggested}</strong></div>
        <ScanField placeholder={`Escanea ${t.suggested}`} onScan={(c) => (c === t.suggested ? finish() : fb(false, `Esta mercancía va a ${t.suggested}`))}
          simulate={[{ label: t.suggested!, code: t.suggested! }, { label: "Otra ubicación", code: t.from!, wrong: true }]} />
      </>}
    </TaskScreen>
  );
}
