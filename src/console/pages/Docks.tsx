import { useMemo, useState } from "react";
import { DoorOpen, Truck, PackageOpen, AlertTriangle, Plus, Clock, Check, CalendarClock } from "lucide-react";
import { apptConflicts, doorBusy } from "../../core/engine";
import { useStore, can, whyNot } from "../../core/store";
import type { Appointment, ApptStatus, Order } from "../../core/types";
import { Button, Card, Code, Modal, Pill, Stat, useToast } from "../../ui/kit";
import { ago, time, type Tone } from "../../ui/format";
import { useConsole } from "../ctx";

export const APPT: Record<ApptStatus, { label: string; tone: Tone }> = {
  programada: { label: "Programada", tone: "pending" },
  en_patio: { label: "En patio", tone: "warn" },
  en_anden: { label: "En andén", tone: "progress" },
  completada: { label: "Completada", tone: "done" },
  cancelada: { label: "Cancelada", tone: "neutral" },
};
const HOUR = 3_600_000;
const CARRIERS: Order["carrier"][] = ["Estafeta", "DHL", "FedEx", "99 Minutos"];

export function Docks() {
  const { state, dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const allowed = can(user.role, "dock.manage");
  const reason = allowed ? undefined : whyNot("dock.manage");
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const now = Date.now();
  const from = Math.floor((now - 3 * HOUR) / HOUR) * HOUR;
  const span = 12 * HOUR;
  const pos = (t: number) => ((t - from) / span) * 100;

  const visible = state.appointments.filter((a) => a.status !== "cancelada" && a.start + a.durationMin * 60_000 > from && a.start < from + span);
  const yard = state.appointments.filter((a) => a.status === "en_patio").sort((a, b) => (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0));
  const atDock = state.appointments.filter((a) => a.status === "en_anden");
  const today = state.appointments.filter((a) => new Date(a.start).toDateString() === new Date().toDateString() && a.status !== "cancelada");
  const waits = state.appointments.filter((a) => a.arrivedAt && a.dockedAt).map((a) => (a.dockedAt! - a.arrivedAt!) / 60_000);
  const sel = state.appointments.find((a) => a.id === selId);

  const dock = (a: Appointment, door: string) => {
    if (doorBusy(state, door, a.id)) return toast(`${door} está ocupado`, "warn");
    dispatch({ type: "DOCK_APPT", appt: a.id, door, user: user.id });
    toast(`${a.party} asignado a ${door}`);
  };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Andenes y patio</h1>
          <p className="muted">Citas de carga y descarga por puerta, control de patio y despacho. Las salidas se cargan escaneando cada pedido en el andén.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} disabledReason={reason} onClick={() => setCreating(true)}>Nueva cita</Button>
      </div>

      <div className="grid-kpi four">
        <Stat label="Citas de hoy" value={today.length} hint={`${today.filter((a) => a.kind === "entrada").length} entradas · ${today.filter((a) => a.kind === "salida").length} salidas`} />
        <Stat label="Unidades en patio" value={yard.length} tone={yard.some((a) => now - (a.arrivedAt ?? now) > 30 * 60_000) ? "warn" : undefined} hint="Esperando puerta" />
        <Stat label="Puertas ocupadas" value={`${atDock.length} / ${state.docks.length}`} hint={atDock.map((a) => a.door).join(" · ") || "Todas libres"} />
        <Stat label="Espera en patio" value={`${(waits.reduce((a, b) => a + b, 0) / Math.max(1, waits.length)).toFixed(0)} min`} hint="Promedio llegada → andén" />
      </div>

      <div className="grid-2-1">
        <Card title="Agenda por puerta" actions={<span className="legend">{(["programada", "en_patio", "en_anden", "completada"] as ApptStatus[]).map((s) => <span key={s}><i className={`gantt-dot st-${s}`} />{APPT[s].label}</span>)}</span>}>
          <div className="gantt">
            <div className="gantt-head">
              <span />
              <div className="gantt-scale">
                {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ left: `${(i / 12) * 100}%` }}>{time(from + i * HOUR)}</span>)}
              </div>
            </div>
            {state.docks.map((d) => (
              <div key={d.code} className="gantt-row">
                <div className="gantt-door"><strong className="mono">{d.code}</strong><small className={d.kind === "entrada" ? "t-progress" : "t-brand"}>{d.kind}</small></div>
                <div className="gantt-track">
                  <i className="gantt-now" style={{ left: `${pos(now)}%` }} />
                  {visible.filter((a) => a.door === d.code).map((a) => {
                    const left = Math.max(0, pos(a.start));
                    const width = Math.min(100 - left, pos(a.start + a.durationMin * 60_000) - left);
                    return (
                      <button key={a.id} className={`gantt-block st-${a.status} ${selId === a.id ? "sel" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}
                        onClick={() => setSelId(a.id)} title={`${a.party} · ${time(a.start)} · ${APPT[a.status].label}`}
                        aria-label={`${a.kind === "entrada" ? "Descarga" : "Recolección"} ${a.party}, ${d.code}, ${time(a.start)} por ${a.durationMin} minutos, ${APPT[a.status].label}`} aria-pressed={selId === a.id}>
                        {/* El estado no depende solo del color: icono + borde (punteado = programada) */}
                        {a.status === "completada" ? <Check size={12} aria-hidden /> : a.status === "en_patio" ? <Clock size={12} aria-hidden /> : a.status === "programada" ? <CalendarClock size={12} aria-hidden /> : a.kind === "entrada" ? <PackageOpen size={12} aria-hidden /> : <Truck size={12} aria-hidden />}<span>{a.party}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {state.appointments.some((a) => a.status !== "cancelada" && !a.door) && (
            <div className="muted small">Sin puerta asignada: {state.appointments.filter((a) => !a.door && a.status !== "cancelada").map((a) => a.id).join(", ")}</div>
          )}
        </Card>

        <Card title={sel ? <span className="row gap-2"><Code>{sel.id}</Code><Pill tone={APPT[sel.status].tone}>{APPT[sel.status].label}</Pill></span> : "Detalle de la cita"} className="sticky">
          {sel ? <ApptPanel a={sel} disabledReason={reason} onDock={dock} onInspect={inspect} /> : <p className="muted">Selecciona un bloque en la agenda o una unidad del patio.</p>}
        </Card>
      </div>

      <Card title={<span className="row gap-2"><DoorOpen size={16} />Patio · unidades esperando ({yard.length})</span>} pad={false}>
        <table className="tbl">
          <thead><tr><th>Cita</th><th>Tipo</th><th>Proveedor / transportista</th><th>Placas</th><th>Cita</th><th>Llegó</th><th>Espera</th><th>Asignar puerta</th></tr></thead>
          <tbody>
            {yard.map((a) => {
              const wait = (now - (a.arrivedAt ?? now)) / 60_000;
              const free = state.docks.filter((d) => d.kind === a.kind && !doorBusy(state, d.code));
              return (
                <tr key={a.id} className={`clickable ${selId === a.id ? "selected" : ""}`} onClick={() => setSelId(a.id)}>
                  <td><Code>{a.id}</Code></td>
                  <td>{a.kind === "entrada" ? "Descarga" : "Carga"}</td>
                  <td><strong>{a.party}</strong>{a.receipt && <div className="muted small">{a.receipt}</div>}</td>
                  <td className="mono">{a.plate}</td>
                  <td className="muted">{time(a.start)}</td>
                  <td className="muted">{a.arrivedAt && ago(a.arrivedAt)}</td>
                  <td className={wait > 30 ? "t-warn" : ""}>{wait > 30 && <AlertTriangle size={13} />} {wait.toFixed(0)} min</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="input sm" aria-label={`Asignar puerta a ${a.party}`} defaultValue="" disabled={!allowed} title={reason} onChange={(e) => e.target.value && dock(a, e.target.value)}>
                      <option value="" disabled>{free.length ? "Elegir puerta" : "Sin puertas libres"}</option>
                      {free.map((d) => <option key={d.code} value={d.code}>{d.code}{d.code === a.door ? " (agendada)" : ""}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {!yard.length && <tr><td colSpan={8} className="muted">No hay unidades esperando en patio.</td></tr>}
          </tbody>
        </table>
      </Card>

      <NewAppt open={creating} onClose={() => setCreating(false)} onCreated={(id) => setSelId(id)} />
    </div>
  );
}

function ApptPanel({ a, disabledReason, onDock, onInspect }: { a: Appointment; disabledReason?: string; onDock: (a: Appointment, door: string) => void; onInspect: ReturnType<typeof useConsole>["inspect"] }) {
  const { state, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [plate, setPlate] = useState("");
  const ready = a.kind === "salida" ? state.orders.filter((o) => o.stage === "empacado" && o.carrier === a.carrier) : [];
  const receipt = a.receipt && state.receipts.find((r) => r.id === a.receipt);
  const free = state.docks.filter((d) => d.kind === a.kind && !doorBusy(state, d.code, a.id));

  return (
    <>
      <div className="kv-grid two">
        <div className="kv"><span>{a.kind === "entrada" ? "Proveedor" : "Transportista"}</span><strong>{a.party}</strong></div>
        <div className="kv"><span>Puerta</span><strong className="mono">{a.door ?? "—"}</strong></div>
        <div className="kv"><span>Ventana</span><strong>{time(a.start)} · {a.durationMin} min</strong></div>
        <div className="kv"><span>Placas</span><strong className="mono">{a.plate ?? "—"}</strong></div>
        {a.arrivedAt && <div className="kv"><span>Llegada</span><strong>{time(a.arrivedAt)}</strong></div>}
        {a.dockedAt && <div className="kv"><span>En andén</span><strong>{time(a.dockedAt)}</strong></div>}
      </div>
      {receipt && <button className="link" onClick={() => onInspect({ kind: "recepcion", id: receipt.id })}>Ver recepción {receipt.id} →</button>}

      {a.status === "programada" && (
        <div className="stack">
          <label className="field">Placas de la unidad<input className="input" value={plate} placeholder="Ej. MX-12-ABC" onChange={(e) => setPlate(e.target.value.toUpperCase())} /></label>
          <Button variant="primary" className="block" disabled={!plate} disabledReason={disabledReason}
            onClick={() => { dispatch({ type: "CHECK_IN", appt: a.id, plate, user: user.id }); toast(`${a.party} registrado en patio`); }}>Registrar llegada a patio</Button>
          <Button variant="ghost" className="block" disabledReason={disabledReason} onClick={() => { dispatch({ type: "CANCEL_APPT", appt: a.id, user: user.id }); toast("Cita cancelada", "info"); }}>Cancelar cita</Button>
        </div>
      )}
      {a.status === "en_patio" && (
        <div className="stack">
          <div className="muted small">Puertas de {a.kind} libres</div>
          <div className="chips">{free.map((d) => <Button key={d.code} size="sm" disabledReason={disabledReason} onClick={() => onDock(a, d.code)}>{d.code}</Button>)}{!free.length && <span className="t-warn small">Todas ocupadas</span>}</div>
        </div>
      )}
      {a.status === "en_anden" && a.kind === "salida" && (
        <div className="stack">
          <h4 className="sec">Pedidos {a.carrier} listos en staging ({ready.length})</h4>
          {ready.map((o) => (
            <div key={o.id} className="row between">
              <button className="link mono" onClick={() => onInspect({ kind: "pedido", id: o.id })}>{o.id}</button>
              <Button size="sm" disabledReason={disabledReason} onClick={() => { dispatch({ type: "LOAD_ORDER", appt: a.id, order: o.id, user: user.id }); toast(`${o.id} cargado y enviado`); }}>Cargar</Button>
            </div>
          ))}
          {!ready.length && <span className="muted small">Nada pendiente. Los empacadores también pueden cargar escaneando desde el handheld.</span>}
          {!!a.loaded?.length && <div className="small">Cargados: {a.loaded.map((o) => <Code key={o} onClick={() => onInspect({ kind: "pedido", id: o })}>{o}</Code>)}</div>}
        </div>
      )}
      {a.status === "en_anden" && (
        <Button variant="primary" className="block" disabledReason={disabledReason}
          onClick={() => { dispatch({ type: "COMPLETE_APPT", appt: a.id, user: user.id }); toast(a.kind === "salida" ? `Unidad despachada · ${a.door} libre` : `${a.door} liberado`); }}>
          {a.kind === "salida" ? "Cerrar carga y despachar" : "Terminar descarga y liberar andén"}
        </Button>
      )}
      {a.status === "completada" && a.kind === "salida" && <div className="small">Pedidos despachados: {a.loaded?.join(", ") || "—"}</div>}
    </>
  );
}

function NewAppt({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [kind, setKind] = useState<Appointment["kind"]>("salida");
  const [carrier, setCarrier] = useState<Order["carrier"]>("DHL");
  const [supplier, setSupplier] = useState("");
  const [door, setDoor] = useState("");
  const [hhmm, setHhmm] = useState(() => time(Date.now() + 2 * HOUR));
  const [dur, setDur] = useState(45);
  const doors = state.docks.filter((d) => d.kind === kind);
  const doorCode = doors.some((d) => d.code === door) ? door : doors[0]?.code;
  const start = useMemo(() => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
  }, [hhmm]);
  const conflicts = doorCode ? apptConflicts(state, doorCode, start, dur) : [];
  const party = kind === "salida" ? carrier : supplier.trim();

  return (
    <Modal open={open} onClose={onClose} title="Nueva cita de andén"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!party || conflicts.length > 0} onClick={() => {
          dispatch({ type: "SCHEDULE_APPT", kind, party, carrier: kind === "salida" ? carrier : undefined, door: doorCode, start, durationMin: dur, user: user.id });
          toast(`Cita programada en ${doorCode} a las ${hhmm}`);
          onCreated(`CITA-${state.seq + 1}`);
          onClose();
        }}>Programar</Button>
      </>}>
      <div className="seg">
        <button className={kind === "salida" ? "on" : ""} onClick={() => setKind("salida")}>Recolección (salida)</button>
        <button className={kind === "entrada" ? "on" : ""} onClick={() => setKind("entrada")}>Descarga (entrada)</button>
      </div>
      {kind === "salida" ? (
        <label className="field">Transportista<select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value as Order["carrier"])}>{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select></label>
      ) : (
        <label className="field">Proveedor<input className="input" value={supplier} placeholder="Nombre del proveedor" onChange={(e) => setSupplier(e.target.value)} /></label>
      )}
      <div className="form-row">
        <label className="field">Puerta<select className="input" value={doorCode} onChange={(e) => setDoor(e.target.value)}>{doors.map((d) => <option key={d.code}>{d.code}</option>)}</select></label>
        <label className="field">Hora<input className="input" type="time" value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></label>
        <label className="field">Duración<select className="input" value={dur} onChange={(e) => setDur(Number(e.target.value))}>{[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}</select></label>
      </div>
      {conflicts.length > 0 ? (
        <div className="banner tone-blocked"><AlertTriangle size={16} /><div><strong>{doorCode} ya está reservada en ese horario</strong>{conflicts.map((c) => <div key={c.id} className="small">{c.id} · {c.party} · {time(c.start)}–{time(c.start + c.durationMin * 60_000)}</div>)}</div></div>
      ) : party ? <div className="banner tone-done">Sin traslapes en {doorCode} entre {hhmm} y {time(start + dur * 60_000)}.</div> : null}
    </Modal>
  );
}
