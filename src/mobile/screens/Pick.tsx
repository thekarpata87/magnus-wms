import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useStore } from "../../core/store";
import { pickTaskLabel } from "../../core/engine";
import type { PickStep } from "../../core/types";
import { QtyPad, ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

export function PickList() {
  const { state } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const open = state.tasks.filter((t) => t.type === "surtir" && t.status !== "completo")
    .sort((a, b) => Number(b.assignee === user.id) - Number(a.assignee === user.id) || a.priority - b.priority);
  return (
    <TaskScreen title="Surtir" context="Tareas de picking liberadas en oleada">
      <div className="hh-list">
        {open.map((t) => {
          const left = t.steps!.filter((s) => s.status === "pendiente").length;
          const who = state.users.find((u) => u.id === t.assignee);
          return (
            <button key={t.id} className={`hh-row ${t.assignee && t.assignee !== user.id ? "dim" : ""}`} onClick={() => nav(`/handheld/surtir/${t.id}`)}>
              <span><strong>{pickTaskLabel(t)}{t.priority === 1 && " · urgente"}</strong><small>{left} líneas · {who ? (who.id === user.id ? "asignada a ti" : who.name) : "sin asignar"}</small></span>
              <em>{t.steps!.length - left}/{t.steps!.length}</em>
            </button>
          );
        })}
        {!open.length && <div className="hh-empty">No hay picking pendiente. Espera la siguiente oleada.</div>}
      </div>
    </TaskScreen>
  );
}

export function PickFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const task = state.tasks.find((t) => t.id === id);
  // Copia local: el operario sigue trabajando aunque se caiga la señal (cola offline).
  const [steps, setSteps] = useState<PickStep[]>(() => structuredClone(task?.steps ?? []));
  const [phase, setPhase] = useState<"loc" | "item" | "qty" | "tote">("loc");
  const [qty, setQty] = useState(0);
  const [excOpen, setExcOpen] = useState(false);
  const [atLoc, setAtLoc] = useState<string | null>(null); // ya estás parado aquí: no se vuelve a escanear
  const [reused, setReused] = useState(false);
  const [putTo, setPutTo] = useState<{ order: string; tote: string; qty: number } | null>(null);
  const multi = !!task?.totes?.length;
  const [cartReady, setCartReady] = useState(() => !multi || (task?.steps ?? []).some((st) => st.status !== "pendiente"));
  if (!task) return <TaskScreen title="Surtir"><p>Tarea no encontrada.</p></TaskScreen>;
  const toteOf = (order: string) => task.totes?.find((t) => t.order === order)?.tote;

  const idx = steps.findIndex((s) => s.status === "pendiente");
  const step = steps[idx];
  const done = steps.filter((s) => s.status !== "pendiente").length;
  const order = state.orders.find((o) => o.id === (step?.order ?? task.doc));
  const label = pickTaskLabel(task);

  if (multi && !cartReady) {
    return (
      <TaskScreen title="Prepara el carro" context={`${label} · ${task.id}`} back="/handheld/surtir"
        primary={<button className="hh-primary" onClick={() => { setCartReady(true); fb(true, `Carro ${task.cart} listo`); }}>Carro listo · empezar ruta</button>}>
        <div className="hh-instr"><span>Coloca y etiqueta un contenedor por pedido</span><strong>Carro {task.cart}</strong>
          <small>{new Set(steps.map((x) => x.from)).size} paradas en una sola ruta{task.zone ? ` · solo zona ${task.zone}` : ""}</small></div>
        <div className="hh-list">
          {task.totes!.map((t) => {
            const o = state.orders.find((x) => x.id === t.order);
            const n = steps.filter((x) => x.order === t.order).reduce((a, x) => a + x.qty, 0);
            return <div key={t.tote} className="hh-row static"><span className="hh-tote" aria-hidden>{t.tote.split("-")[1]}</span>
              <span><strong>{t.tote} → {t.order}</strong><small>{o?.customer} · {n} pzas</small></span></div>;
          })}
        </div>
      </TaskScreen>
    );
  }

  if (putTo) {
    return (
      <TaskScreen title={label} context={task.id} progress={[done, steps.length]} back="/handheld/surtir">
        <Steps items={["Ir a ubicación", "Escanear artículo", "Cantidad", "Contenedor"]} current={3} />
        <div className="hh-instr big tote"><span>Pon {putTo.qty} pzas en</span><strong className="mono">{putTo.tote}</strong><small>Pedido {putTo.order} · {state.orders.find((o) => o.id === putTo.order)?.customer}</small></div>
        <ScanField placeholder={`Escanea el contenedor ${putTo.tote}`} onScan={(c) => {
          if (c !== putTo.tote) {
            const other = task.totes?.find((t) => t.tote === c);
            return fb(false, other ? `${c} es de ${other.order}. Va en ${putTo.tote}` : `Escanea el contenedor ${putTo.tote}`);
          }
          fb(true, `${putTo.tote} · ${putTo.order}`);
          setPutTo(null);
          const nx = steps.find((x) => x.status === "pendiente");
          setReused(!!nx && nx.from === atLoc);
          setPhase(nx && nx.from === atLoc ? "item" : "loc");
        }} simulate={[{ label: putTo.tote, code: putTo.tote }, ...(task.totes!.length > 1 ? [{ label: "Otro contenedor", code: task.totes!.find((t) => t.tote !== putTo.tote)!.tote, wrong: true }] : [])]} />
      </TaskScreen>
    );
  }

  if (!step) {
    const shorts = steps.filter((s) => s.status === "faltante").length;
    return (
      <TaskScreen title="Surtido completo" context={label} progress={[done, steps.length]}
        primary={<button className="hh-primary" onClick={() => nav("/handheld")}>Siguiente tarea</button>}>
        <div className="hh-done">
          <CheckCircle2 size={72} />
          <strong>{multi ? `Lleva el carro ${task.cart} a PACK-01` : "Lleva el contenedor a PACK-01"}</strong>
          <span>{steps.length - shorts} líneas surtidas{shorts ? ` · ${shorts} con excepción` : ""}</span>
          {multi && <span>{task.totes!.map((t) => `${t.tote} → ${t.order}`).join(" · ")}</span>}
        </div>
      </TaskScreen>
    );
  }

  const p = state.products.find((x) => x.sku === step.sku)!;
  const lot = state.lots.find((l) => l.code === step.lot);
  const remaining = step.qty - step.done;

  const start = () => task.status === "pendiente" && dispatch({ type: "START_TASK", task: task.id, user: user.id, device: "Handheld" });

  const onLoc = (c: string) => {
    if (c !== step.from) return fb(false, `Ubicación incorrecta. Ve a ${step.from}`);
    start();
    fb(true, step.from);
    setAtLoc(step.from);
    setReused(false);
    setPhase("item");
  };
  const onItem = (c: string) => {
    if (c !== p.barcode && c !== p.sku) return fb(false, "Artículo incorrecto: revisa la foto");
    fb(true, p.name);
    setQty(remaining);
    setPhase("qty");
  };
  const confirm = () => {
    if (qty <= 0) return;
    if (qty < remaining) {
      if (!window.confirm(`Vas a surtir ${qty} de ${remaining}. ¿Reportar el resto como faltante?`)) return;
    }
    dispatch({ type: "PICK_STEP", task: task.id, index: idx, qty: Math.min(qty, remaining), user: user.id, device: "Handheld" });
    const ns = structuredClone(steps);
    ns[idx].done += Math.min(qty, remaining);
    if (ns[idx].done >= ns[idx].qty) ns[idx].status = "hecho";
    else {
      dispatch({ type: "PICK_EXCEPTION", task: task.id, index: idx, kind: "faltante", user: user.id, device: "Handheld" });
      ns[idx].status = "faltante";
    }
    setSteps(ns);
    fb(true, ns[idx].status === "hecho" ? "Línea completa" : "Parcial registrado");
    const tote = toteOf(step.order);
    if (multi && tote) { setPutTo({ order: step.order, tote, qty: Math.min(qty, remaining) }); return; }
    const nx = ns.find((x) => x.status === "pendiente");
    setReused(!!nx && nx.from === step.from);
    setPhase(nx && nx.from === step.from ? "item" : "loc");
  };
  const exception = (kind: "faltante" | "danado" | "saltar") => {
    setExcOpen(false);
    dispatch({ type: "PICK_EXCEPTION", task: task.id, index: idx, kind, user: user.id, device: "Handheld" });
    const ns = structuredClone(steps);
    if (kind === "saltar") { const [s] = ns.splice(idx, 1); ns.push(s); fb(true, "Línea movida al final de la ruta"); }
    else { ns[idx].status = "faltante"; fb(false, kind === "danado" ? "Dañado reportado · se pidió conteo" : "Faltante reportado · se pidió conteo"); }
    setSteps(ns);
    const nx = ns.find((x) => x.status === "pendiente");
    setPhase(nx && nx.from === atLoc ? "item" : "loc");
  };

  const nextStop = steps.slice(idx + 1).find((s) => s.status === "pendiente");

  return (
    <TaskScreen title={multi ? label : `Pedido ${task.doc}`} context={multi ? `${task.id} · línea de ${step.order} → ${toteOf(step.order)}` : `${order?.carrier} · ${task.id}`} progress={[done, steps.length]} back="/handheld/surtir"
      primary={phase === "qty" ? <button className="hh-primary" onClick={confirm}>Confirmar {qty} pzas</button> : undefined}
      secondary={<>
        <button className="hh-exc" onClick={() => setExcOpen(true)}>Excepción</button>
        {nextStop && <span className="hh-muted small">Después: {nextStop.from}</span>}
      </>}>
      <Steps items={multi ? ["Ir a ubicación", "Escanear artículo", "Cantidad", "Contenedor"] : ["Ir a ubicación", "Escanear artículo", "Confirmar cantidad"]} current={phase === "loc" ? 0 : phase === "item" ? 1 : 2} />
      {phase === "item" && reused && atLoc === step.from && <div className="hh-last ok"><span aria-hidden>📍</span>Sigues en {step.from}: no hace falta volver a escanear la ubicación</div>}

      {phase === "loc" && <>
        <div className="hh-instr big"><span>Ve a</span><strong className="mono">{step.from}</strong><small>Toma {remaining} × {p.name}</small></div>
        <ScanField placeholder="Escanea la ubicación" onScan={onLoc}
          simulate={[{ label: step.from, code: step.from }, { label: "Ubicación vecina", code: step.from.replace(/\d$/, (d) => String((Number(d) % 3) + 1)), wrong: true }]} />
      </>}

      {phase !== "loc" && (
        <div className="hh-product xl">
          <span className="hh-photo">{p.emoji}</span>
          <div>
            <strong>{p.name}</strong>
            <span className="mono">{p.sku} · {step.from}</span>
            {lot && <span>Lote {lot.code}{lot.expiryDate && ` · cad. ${lot.expiryDate}`} <b className="hh-tag">{state.rules.removal}</b></span>}
          </div>
        </div>
      )}
      {phase === "item" && <>
        <div className="hh-instr"><span>Escanea el artículo</span><strong>Toma {remaining} pzas</strong></div>
        <ScanField placeholder="Escanea el código de barras" onScan={onItem}
          simulate={[{ label: "Artículo correcto", code: p.barcode }, { label: "Artículo equivocado", code: state.products.find((x) => x.sku !== p.sku)!.barcode, wrong: true }]} />
      </>}
      {phase === "qty" && <QtyPad value={qty} onChange={setQty} max={remaining} />}

      {excOpen && (
        <div className="hh-sheet" role="dialog" aria-label="Reportar excepción">
          <div className="hh-sheet-b">
            <strong>¿Qué pasó en {step.from}?</strong>
            <button className="hh-exc-big" onClick={() => exception("faltante")}>Faltante<small>No hay o hay menos de {remaining}</small></button>
            <button className="hh-exc-big" onClick={() => exception("danado")}>Dañado<small>El producto no se puede enviar</small></button>
            <button className="hh-exc-big" onClick={() => exception("saltar")}>Saltar<small>Volver a esta línea al final</small></button>
            <button className="hh-ghost" onClick={() => setExcOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </TaskScreen>
  );
}
