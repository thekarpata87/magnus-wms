import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Truck } from "lucide-react";
import { useStore } from "../../core/store";
import { ScanField, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";
import { time } from "../../ui/format";

// Staging y carga: cada caja se escanea al subirla a la unidad (investigación, "Salida", paso 4).
export function LoadList() {
  const { state } = useStore();
  const nav = useNavigate();
  const atDock = state.appointments.filter((a) => a.kind === "salida" && a.status === "en_anden");
  const coming = state.appointments.filter((a) => a.kind === "salida" && (a.status === "programada" || a.status === "en_patio")).sort((a, b) => a.start - b.start);
  return (
    <TaskScreen title="Cargar" context="Unidades de paquetería en andén">
      <div className="hh-list">
        {atDock.map((a) => {
          const ready = state.orders.filter((o) => o.stage === "empacado" && o.carrier === a.carrier).length;
          return (
            <button key={a.id} className="hh-row" onClick={() => nav(`/handheld/cargar/${a.id}`)}>
              <Truck size={26} />
              <span><strong>{a.door} · {a.party}</strong><small>{a.plate} · {ready} pedido(s) por cargar</small></span>
              <em>{a.loaded?.length ?? 0}</em>
            </button>
          );
        })}
        {!atDock.length && <div className="hh-empty">No hay unidades en andén. El supervisor asigna la puerta cuando la unidad llega al patio.</div>}
      </div>
      {coming.length > 0 && <>
        <div className="hh-label">Próximas recolecciones</div>
        <div className="hh-list">{coming.map((a) => (
          <div key={a.id} className="hh-row static dim"><span><strong>{a.party}</strong><small>{time(a.start)} · {a.door ?? "sin puerta"} · {a.status === "en_patio" ? "en patio" : "programada"}</small></span></div>
        ))}</div>
      </>}
    </TaskScreen>
  );
}

export function LoadFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const a = state.appointments.find((x) => x.id === id);
  const [loaded, setLoaded] = useState<string[]>(() => a?.loaded ?? []);
  if (!a) return <TaskScreen title="Cargar"><p>Cita no encontrada.</p></TaskScreen>;
  const ready = state.orders.filter((o) => o.stage === "empacado" && o.carrier === a.carrier && !loaded.includes(o.id));

  const onScan = (c: string) => {
    const o = state.orders.find((x) => x.id === c || x.boxes?.some((b) => b.tracking === c));
    if (!o) return fb(false, "Etiqueta no reconocida");
    if (loaded.includes(o.id)) return fb(false, `${o.id} ya está cargado`);
    if (o.carrier !== a.carrier) {
      const door = state.appointments.find((x) => x.carrier === o.carrier && x.status === "en_anden")?.door;
      return fb(false, `¡Alto! Va con ${o.carrier}${door ? ` (${door})` : ""}, no con ${a.carrier}`);
    }
    if (o.stage !== "empacado") return fb(false, `${o.id} no está empacado`);
    dispatch({ type: "LOAD_ORDER", appt: a.id, order: o.id, user: user.id, device: "Handheld" });
    setLoaded((x) => [...x, o.id]);
    fb(true, `${o.id} cargado`);
  };
  const other = state.orders.find((o) => o.stage === "empacado" && o.carrier !== a.carrier);

  return (
    <TaskScreen title={`Cargar ${a.door}`} context={`${a.party} · ${a.plate}`} progress={[loaded.length, loaded.length + ready.length]} back="/handheld/cargar"
      primary={<button className="hh-primary" disabled={a.status !== "en_anden" && !loaded.length} onClick={() => {
        dispatch({ type: "COMPLETE_APPT", appt: a.id, user: user.id, device: "Handheld" });
        fb(true, `Unidad despachada · ${a.door} libre`);
        nav("/handheld");
      }}>Cerrar carga y despachar</button>}>
      <div className="hh-instr big"><span>Escanea cada caja al subirla</span><strong className="mono">{a.door}</strong><small>{ready.length} por cargar · {loaded.length} cargadas</small></div>
      <ScanField placeholder="Escanea guía o pedido" onScan={onScan}
        simulate={[...(ready[0] ? [{ label: ready[0].boxes?.at(-1)?.tracking ?? ready[0].id, code: ready[0].boxes?.at(-1)?.tracking ?? ready[0].id }] : []),
          ...(other ? [{ label: `Caja de ${other.carrier}`, code: other.id, wrong: true }] : [])]} />
      <div className="hh-list">
        {ready.map((o) => <div key={o.id} className="hh-row static"><span><strong>{o.id}</strong><small>{o.customer} · {o.boxes?.length ?? 0} caja(s)</small></span><em>{o.boxes?.at(-1)?.tracking.slice(-4)}</em></div>)}
        {loaded.map((o) => <div key={o} className="hh-row static done"><span><strong>{o}</strong><small>Cargado</small></span><em>✓</em></div>)}
      </div>
    </TaskScreen>
  );
}
