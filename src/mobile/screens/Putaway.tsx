import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { suggestPutaway, STORAGE_TYPES } from "../../core/engine";
import { useStore } from "../../core/store";
import { ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";

export function PutawayList() {
  const { state } = useStore();
  const nav = useNavigate();
  const open = state.tasks.filter((t) => t.type === "ubicar" && t.status !== "completo");
  return (
    <TaskScreen title="Ubicar" context={`${open.length} tarimas/cajas en recepción`}>
      <div className="hh-list">
        {open.map((t) => {
          const p = state.products.find((x) => x.sku === t.sku)!;
          return (
            <button key={t.id} className="hh-row" onClick={() => nav(`/handheld/ubicar/${t.id}`)}>
              <span className="hh-emoji">{p.emoji}</span>
              <span><strong>{t.qty} × {p.name}</strong><small>{t.from} → {t.suggested}</small></span>
              <em>{t.id.replace("TSK-", "#")}</em>
            </button>
          );
        })}
        {!open.length && <div className="hh-empty">Nada por ubicar. ¡Buen trabajo!</div>}
      </div>
    </TaskScreen>
  );
}

export function PutawayFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const t = state.tasks.find((x) => x.id === id);
  const [phase, setPhase] = useState<"item" | "loc" | "done">("item");
  const [target, setTarget] = useState(t?.suggested);
  const [tried, setTried] = useState<string[]>([]);
  if (!t) return <TaskScreen title="Ubicar"><p>Tarea no encontrada.</p></TaskScreen>;
  const p = state.products.find((x) => x.sku === t.sku)!;

  const onItem = (c: string) => {
    if (c === p.barcode || c === p.sku || c === t.id) {
      fb(true, p.name);
      dispatch({ type: "START_TASK", task: t.id, user: user.id, device: "Handheld" });
      setPhase("loc");
    } else fb(false, "No es el artículo de esta tarea");
  };

  const finish = (loc: string) => {
    dispatch({ type: "CONFIRM_PUTAWAY", task: t.id, to: loc, user: user.id, device: "Handheld" });
    fb(true, `Ubicado en ${loc}`);
    setPhase("done");
    const next = state.tasks.find((x) => x.type === "ubicar" && x.status !== "completo" && x.id !== t.id);
    setTimeout(() => nav(next ? `/handheld/ubicar/${next.id}` : "/handheld/ubicar"), 700);
  };

  const onLoc = (c: string) => {
    const l = state.locations.find((x) => x.code === c);
    if (!l) return fb(false, `${c} no es una ubicación`);
    if (!STORAGE_TYPES.has(l.type) || l.blocked) return fb(false, `${c} no admite almacenaje`);
    if (c !== target) {
      if (!window.confirm(`La ubicación sugerida es ${target}. ¿Ubicar en ${c}? Quedará registrado.`)) return;
    }
    finish(c);
  };

  const full = () => {
    const ex = [...tried, target!];
    const alt = suggestPutaway(state, t.sku!, t.qty!, ex);
    setTried(ex);
    setTarget(alt);
    fb(false, alt ? `Nueva sugerencia: ${alt}` : "Sin ubicaciones disponibles: avisa al supervisor");
  };

  return (
    <TaskScreen title="Ubicar" context={`${t.id} · ${t.doc}`} back="/handheld/ubicar"
      secondary={phase === "loc" && <>
        <button className="hh-exc" onClick={full}>Ubicación llena</button>
        <button className="hh-exc" onClick={() => fb(false, "Etiqueta reportada · escanea la ubicación vecina")}>Etiqueta ilegible</button>
      </>}>
      <Steps items={["Escanear artículo", "Escanear ubicación"]} current={phase === "item" ? 0 : phase === "loc" ? 1 : 2} />
      <div className="hh-product">
        <span className="hh-photo">{p.emoji}</span>
        <div><strong>{p.name}</strong><span>{t.qty} pzas{t.lot && ` · lote ${t.lot}`} · desde {t.from}</span></div>
      </div>
      {phase === "item" && <>
        <div className="hh-instr"><span>Escanea el artículo o la etiqueta LPN</span><strong>{p.sku}</strong></div>
        <ScanField placeholder="Escanea artículo" onScan={onItem} simulate={[{ label: "Artículo correcto", code: p.barcode }, { label: "Otro artículo", code: "7501000000000", wrong: true }]} />
      </>}
      {phase !== "item" && <>
        <div className="hh-instr big"><span>Lleva a</span><strong className="mono">{target ?? "—"}</strong><small>Regla: {state.rules.putaway.replace("_", " ")}</small></div>
        <ScanField placeholder="Escanea la ubicación destino" onScan={onLoc} disabled={phase === "done"}
          simulate={target ? [{ label: target, code: target }, { label: "PACK-01", code: "PACK-01", wrong: true }] : []} />
      </>}
    </TaskScreen>
  );
}
