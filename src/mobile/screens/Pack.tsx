import { useState } from "react";
import { CheckCircle2, Printer, Scale } from "lucide-react";
import { useStore } from "../../core/store";
import { pendingWithdraw } from "../../core/engine";
import { ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

const BOXES = [
  { id: "Caja S", dims: "25×20×10 cm", tare: 0.2, maxKg: 3 },
  { id: "Caja M", dims: "40×30×20 cm", tare: 0.45, maxKg: 10 },
  { id: "Caja L", dims: "60×40×40 cm", tare: 0.9, maxKg: 25 },
];

export function PackFlow() {
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const fb = useFeedback();
  const ready = state.orders.filter((o) => o.stage === "surtido" && !o.hold && !pendingWithdraw(state, o.id));
  const blocked = state.orders.filter((o) => o.stage === "surtido" && (o.hold || pendingWithdraw(state, o.id)));
  // Contenedor del carro (surtido por lote o zona): la etiqueta del contenedor identifica al pedido
  // En surtido por zona un pedido llega en un contenedor por zona: todos lo identifican y hay que reunirlos.
  const totesFor = (order: string) => state.tasks.filter((t) => t.type === "surtir" && t.totes)
    .flatMap((t) => t.totes!.filter((x) => x.order === order).map((x) => ({ tote: x.tote, zone: t.zone })));
  const toteFor = (order: string) => totesFor(order).at(-1)?.tote;
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, number>>({});
  const [box, setBox] = useState<string | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const o = state.orders.find((x) => x.id === orderId);

  const reset = () => { setOrderId(null); setChecked({}); setBox(null); setWeight(null); };

  if (done) {
    const d = state.orders.find((x) => x.id === done);
    return (
      <TaskScreen title="Empaque terminado" context={done}
        primary={<button className="hh-primary" onClick={() => setDone(null)}>Empacar otro pedido</button>}>
        <div className="hh-done">
          <CheckCircle2 size={72} />
          <strong>Guía impresa · {d?.boxes?.at(-1)?.tracking ?? "en cola"}</strong>
          <span>Coloca la caja en el staging de {d?.carrier}</span>
        </div>
      </TaskScreen>
    );
  }

  if (!o) {
    return (
      <TaskScreen title="Empacar" context="Estación PACK-01 · báscula e impresora conectadas">
        <Steps items={["Pedido", "Validar artículos", "Caja y peso", "Guía"]} current={0} />
        <div className="hh-instr"><span>Escanea el pedido o el contenedor</span><strong>{ready.length} pedidos listos</strong></div>
        <ScanField placeholder="Escanea el pedido o el contenedor" onScan={(c) => {
          const x = ready.find((r) => r.id === c) ?? ready.find((r) => totesFor(r.id).some((x) => x.tote === c));
          if (x) { fb(true, x.id); setOrderId(x.id); }
          else if (blocked.some((b) => b.id === c)) fb(false, `${c} tiene un lote retenido: espera el retiro a cuarentena`);
          else fb(false, state.orders.some((r) => r.id === c) ? `${c} aún no está surtido` : "Pedido no reconocido");
        }} simulate={ready.slice(0, 2).map((r) => ({ label: toteFor(r.id) ? `Contenedor ${toteFor(r.id)}` : r.id, code: toteFor(r.id) ?? r.id, wrong: false })).concat([{ label: "Pedido sin surtir", code: "PED-5013", wrong: true }])} />
        <div className="hh-list">
          {ready.map((r) => (
            <button key={r.id} className="hh-row" onClick={() => setOrderId(r.id)}>
              <span><strong>{r.id}{totesFor(r.id).length > 0 && ` · ${totesFor(r.id).map((x) => x.tote).join(" + ")}`}</strong><small>{r.customer} · {r.carrier}</small></span>
              <em>{r.lines.reduce((s, l) => s + l.picked, 0)} pzas</em>
            </button>
          ))}
          {!ready.length && <div className="hh-empty">No hay pedidos surtidos esperando empaque.</div>}
          {blocked.map((r) => (
            <div key={r.id} className="hh-row static dim"><span><strong>{r.id} · bloqueado</strong><small>Lote retenido: primero se retira a QUA-01</small></span><em>⛔</em></div>
          ))}
        </div>
      </TaskScreen>
    );
  }

  const lines = o.lines.filter((l) => l.picked > 0);
  const gather = totesFor(o.id);
  const allChecked = lines.every((l) => (checked[l.sku] ?? 0) >= l.picked);
  const units = lines.reduce((s, l) => s + l.picked, 0);
  const checkedUnits = lines.reduce((s, l) => s + Math.min(l.picked, checked[l.sku] ?? 0), 0);
  const netKg = lines.reduce((s, l) => s + l.picked * (state.products.find((p) => p.sku === l.sku)?.weightKg ?? 0), 0);
  const suggested = BOXES.find((b) => b.maxKg >= netKg)?.id ?? "Caja L";
  const phase = !allChecked ? 1 : !weight ? 2 : 3;

  const onItem = (c: string) => {
    const p = state.products.find((x) => x.barcode === c || x.sku === c);
    const l = p && lines.find((x) => x.sku === p.sku);
    if (!p || !l) return fb(false, "Ese artículo no pertenece al pedido");
    if ((checked[p.sku] ?? 0) >= l.picked) return fb(false, `${p.name}: ya validaste ${l.picked}`);
    setChecked((x) => ({ ...x, [p.sku]: (x[p.sku] ?? 0) + 1 }));
    fb(true, `${p.name} ${(checked[p.sku] ?? 0) + 1}/${l.picked}`);
  };
  const nextSku = lines.find((l) => (checked[l.sku] ?? 0) < l.picked);

  return (
    <TaskScreen title={`Empacar ${o.id}`} context={`${o.customer} · ${o.carrier}`} progress={[checkedUnits, units]} back="/handheld"
      secondary={<button className="hh-ghost" onClick={reset}>Cambiar pedido</button>}
      primary={phase === 3 ? (
        <button className="hh-primary" onClick={() => {
          dispatch({ type: "PACK_ORDER", order: o.id, box: box ?? suggested, weightKg: weight!, user: user.id, device: "Handheld" });
          fb(true, "Guía impresa");
          setDone(o.id);
          reset();
        }}><Printer size={22} /> Cerrar caja e imprimir guía</button>
      ) : undefined}>
      <Steps items={["Pedido", "Validar artículos", "Caja y peso", "Guía"]} current={phase} />
      {gather.length > 1 && phase === 1 && (
        <div className="hh-instr"><span>Consolida {gather.length} contenedores de este pedido</span>
          <strong className="mono">{gather.map((x) => x.tote).join(" + ")}</strong>
          <small>{gather.map((x) => `${x.tote}${x.zone ? ` (zona ${x.zone})` : ""}`).join(" · ")}</small></div>
      )}
      {phase === 1 && <>
        <ScanField placeholder="Escanea cada artículo" onScan={onItem}
          simulate={nextSku ? [{ label: "Siguiente artículo", code: state.products.find((p) => p.sku === nextSku.sku)!.barcode }, { label: "Artículo ajeno", code: state.products.find((p) => p.sku === "TOR-14")!.barcode, wrong: true }] : []} />
        {nextSku && (checked[nextSku.sku] ?? 0) > 0 && (
          <button className="hh-ghost" onClick={() => {
            setChecked((x) => ({ ...x, [nextSku.sku]: nextSku.picked }));
            fb(true, `${nextSku.picked - (checked[nextSku.sku] ?? 0)} pzas confirmadas por conteo`);
          }}>
            Artículo validado · confirmar las {nextSku.picked - (checked[nextSku.sku] ?? 0)} restantes
          </button>
        )}
        <div className="hh-list">
          {lines.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku)!;
            const n = checked[l.sku] ?? 0;
            return (
              <div key={l.sku} className={`hh-row static ${n >= l.picked ? "done" : ""}`}>
                <span className="hh-emoji">{p.emoji}</span>
                <span><strong>{p.name}</strong><small>{p.sku}</small></span>
                <em>{n}/{l.picked}</em>
              </div>
            );
          })}
        </div>
      </>}
      {phase >= 2 && <>
        <div className="hh-label">Caja · sugerida por peso neto ({netKg.toFixed(1)} kg)</div>
        <div className="hh-boxes">
          {BOXES.map((b) => (
            <button key={b.id} className={(box ?? suggested) === b.id ? "on" : ""} onClick={() => { setBox(b.id); setWeight(null); }}>
              <strong>{b.id}</strong><small>{b.dims}</small>{b.id === suggested && <em>Sugerida</em>}
            </button>
          ))}
        </div>
        <button className="hh-scale" onClick={() => {
          const tare = BOXES.find((b) => b.id === (box ?? suggested))!.tare;
          const w = Math.round((netKg + tare + Math.random() * 0.08) * 100) / 100;
          setWeight(w);
          fb(true, `${w.toFixed(2)} kg`);
        }}>
          <Scale size={26} />
          {weight ? <span><strong>{weight.toFixed(2)} kg</strong> leído de la báscula</span> : <span>Leer báscula</span>}
        </button>
      </>}
    </TaskScreen>
  );
}
