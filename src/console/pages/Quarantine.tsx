import { useMemo, useState } from "react";
import { ShieldAlert, Lock, Unlock } from "lucide-react";
import { quarantineItems } from "../../core/engine";
import { useStore, can, whyNot } from "../../core/store";
import type { QcDecisionType } from "../../core/types";
import { Button, Card, Code, Empty, Modal, Pill, Stat, useToast } from "../../ui/kit";
import { dateTime, num } from "../../ui/format";
import { useConsole } from "../ctx";
import { Expiry } from "../Inspector";

const DECISION: Record<QcDecisionType, { label: string; desc: string; effect: string }> = {
  liberar: { label: "Liberar a stock", desc: "Pasó la inspección; vuelve a estar disponible.", effect: "Se crea una tarea de ubicación desde QUA-01 al bin sugerido (handheld)." },
  proveedor: { label: "Devolver al proveedor (RTV)", desc: "Defecto de origen o garantía del proveedor.", effect: "Sale del inventario hacia el proveedor para nota de cargo." },
  merma: { label: "Dar de baja (merma)", desc: "No recuperable: dañado, contaminado o vencido.", effect: "Sale del inventario con acta de merma." },
};

type Item = ReturnType<typeof quarantineItems>[number];

export function Quarantine() {
  const { state, bal } = useStore();
  const { user, inspect } = useConsole();
  const items = useMemo(() => quarantineItems(state, bal), [state, bal]);
  const [deciding, setDeciding] = useState<Item | null>(null);
  const [holding, setHolding] = useState(false);
  const allowed = can(user.role, "quality.release");
  const reason = allowed ? undefined : whyNot("quality.release");
  const qcHeld = state.lots.filter((l) => l.hold && !l.hold.recall);
  const releasing = state.tasks.filter((t) => t.type === "ubicar" && t.from === "QUA-01" && t.status !== "completo");
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  const docLink = (doc: string) => doc.startsWith("RMA") ? <Code onClick={() => inspect({ kind: "rma", id: doc })}>{doc}</Code>
    : doc.startsWith("PED") ? <Code onClick={() => inspect({ kind: "pedido", id: doc })}>{doc}</Code> : <Code>{doc || "—"}</Code>;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Cuarentena y calidad</h1>
          <p className="muted">Todo lo que entra a QUA-01 espera una decisión documentada de calidad: liberar a stock, devolver al proveedor o dar de baja. Un lote en recall nunca vuelve a stock.</p>
        </div>
        <Button icon={<Lock size={15} />} disabledReason={reason} onClick={() => setHolding(true)}>Retener lote</Button>
      </div>

      <div className="grid-kpi four">
        <Stat label="Piezas en cuarentena" value={num(items.reduce((n, i) => n + i.qty, 0))} hint={`${items.length} partida(s) por decidir`} />
        <Stat label="Antigüedad máxima" value={`${Math.max(0, ...items.map((i) => i.days))} d`} tone={items.some((i) => i.days > 7) ? "warn" : undefined} hint="Meta: decidir en < 7 días" />
        <Stat label="En liberación" value={releasing.length} hint="Tareas de ubicación desde QUA-01" />
        <Stat label="Lotes retenidos por calidad" value={qcHeld.length} hint="Retenidos en su ubicación" />
      </div>

      <Card title={<span className="row gap-2"><ShieldAlert size={16} aria-hidden />Partidas por decidir ({items.length})</span>} pad={false}>
        {items.length ? (
          <table className="tbl">
            <thead><tr><th>Producto</th><th>Lote</th><th className="r">Pzas</th><th>Origen</th><th>Ingreso</th><th>Liberable</th><th></th></tr></thead>
            <tbody>{items.map((it) => {
              const p = state.products.find((x) => x.sku === it.sku);
              return (
                <tr key={it.sku + it.lot}>
                  <td><button className="link" onClick={() => inspect({ kind: "producto", id: it.sku })}>{p?.emoji} {p?.name}</button><div className="mono muted small">{it.sku}</div></td>
                  <td>{it.lot ? <><Code onClick={() => inspect({ kind: "lote", id: it.lot! })}>{it.lot}</Code><div className="small"><Expiry iso={it.lotInfo?.expiryDate} /></div></> : <span className="muted">—</span>}</td>
                  <td className="r mono"><strong>{num(it.qty)}</strong>{it.releasing > 0 && <div className="small muted">+{it.releasing} en liberación</div>}</td>
                  <td><Pill tone={it.origin === "Recall" ? "blocked" : "neutral"} dot={false}>{it.origin}</Pill> {docLink(it.doc)}<div className="small muted">{it.note}</div></td>
                  <td className={it.days > 7 ? "t-warn" : "muted"}>{dateTime(it.since)}<div className="small">{it.days} día(s)</div></td>
                  <td>{it.releaseBlock ? <span className="small t-blocked">{it.releaseBlock}</span> : <Pill tone="done">Sí</Pill>}</td>
                  <td className="r"><Button size="sm" variant="primary" disabledReason={reason} onClick={() => setDeciding(it)}>Decidir…</Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty icon={<ShieldAlert size={28} />} title="Cuarentena vacía">Las devoluciones defectuosas, los retiros por recall y lo que mande calidad aparecerán aquí.</Empty>}
      </Card>

      <div className="grid-2">
        <Card title={<span className="row gap-2"><Lock size={16} aria-hidden />Lotes retenidos por calidad</span>} pad={false}>
          <table className="tbl compact">
            <thead><tr><th>Lote</th><th>Motivo</th><th>Desde</th><th></th></tr></thead>
            <tbody>
              {qcHeld.map((l) => <ReleaseRow key={l.code} lot={l.code} reason={l.hold!.reason} since={l.hold!.since} disabledReason={reason} />)}
              {!qcHeld.length && <tr><td colSpan={4} className="muted">Ningún lote retenido por calidad. Los lotes en recall se gestionan en Cumplimiento.</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title="Historial de decisiones" pad={false}>
          <table className="tbl compact">
            <thead><tr><th>Decisión</th><th>Partida</th><th>Por</th><th>Nota</th></tr></thead>
            <tbody>
              {state.qc.slice(0, 12).map((d) => (
                <tr key={d.id}>
                  <td><Pill tone={d.decision === "liberar" ? "done" : d.decision === "proveedor" ? "progress" : "blocked"} dot={false}>{DECISION[d.decision].label}</Pill><div className="small muted mono">{d.id} · {dateTime(d.at)}</div></td>
                  <td className="small mono">{d.qty} × {d.sku}{d.lot && ` · ${d.lot}`}</td>
                  <td className="small">{name(d.by)}</td>
                  <td className="small muted">{d.note}</td>
                </tr>
              ))}
              {!state.qc.length && <tr><td colSpan={4} className="muted">Sin decisiones registradas.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      {deciding && <DecideModal item={deciding} onClose={() => setDeciding(null)} />}
      {holding && <HoldModal onClose={() => setHolding(false)} />}
    </div>
  );
}

function DecideModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [decision, setDecision] = useState<QcDecisionType>(item.releaseBlock ? "merma" : "liberar");
  const [qty, setQty] = useState(item.qty);
  const [note, setNote] = useState("");
  const p = state.products.find((x) => x.sku === item.sku);
  const ok = note.trim().length >= 10 && qty > 0 && qty <= item.qty && !(decision === "liberar" && item.releaseBlock);
  return (
    <Modal open onClose={onClose} title="Decisión de calidad"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant={decision === "merma" ? "danger" : "primary"} disabled={!ok} onClick={() => {
          dispatch({ type: "QC_DECIDE", sku: item.sku, lot: item.lot, qty, decision, note, user: user.id });
          toast(decision === "liberar" ? `${qty} pzas liberadas: tarea de ubicación enviada al handheld` : `${qty} pzas ${decision === "proveedor" ? "devueltas al proveedor" : "dadas de baja"}`);
          onClose();
        }}>Registrar decisión</Button>
      </>}>
      <div className="row gap-2"><strong>{p?.emoji} {p?.name}</strong><span className="muted small mono">{item.lot ?? "sin lote"} · {item.qty} pzas · {item.origin}</span></div>
      <div className="opts" role="radiogroup" aria-label="Decisión">
        {(Object.keys(DECISION) as QcDecisionType[]).map((k) => {
          const blocked = k === "liberar" && item.releaseBlock;
          return (
            <label key={k} className={`opt ${decision === k ? "on" : ""} ${blocked ? "disabled" : ""}`}>
              <input type="radio" name="qc" checked={decision === k} disabled={!!blocked} onChange={() => setDecision(k)} />
              <span><strong>{DECISION[k].label}</strong><small>{blocked ? item.releaseBlock : DECISION[k].desc}</small></span>
            </label>
          );
        })}
      </div>
      <label className="field">Cantidad (de {item.qty})
        <input className="input num" type="number" min={1} max={item.qty} value={qty} onChange={(e) => setQty(Math.max(0, Math.min(item.qty, Number(e.target.value))))} />
      </label>
      <label className="field">Resultado de la inspección (obligatorio, mín. 10 caracteres)
        <textarea className="input area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-autofocus
          placeholder={decision === "liberar" ? "Ej. Empaque íntegro, prueba funcional OK." : decision === "proveedor" ? "Ej. Falla de fábrica confirmada; garantía del proveedor." : "Ej. Envase roto, no recuperable."} />
      </label>
      <div className="banner tone-neutral">{DECISION[decision].effect}</div>
    </Modal>
  );
}

function ReleaseRow({ lot, reason, since, disabledReason }: { lot: string; reason: string; since: number; disabledReason?: string }) {
  const { dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <tr>
      <td><Code onClick={() => inspect({ kind: "lote", id: lot })}>{lot}</Code></td>
      <td className="small">{reason}</td>
      <td className="small muted">{dateTime(since)}</td>
      <td className="r">
        <Button size="sm" icon={<Unlock size={14} />} disabledReason={disabledReason} onClick={() => setOpen(true)}>Liberar</Button>
        <Modal open={open} onClose={() => setOpen(false)} title={`Liberar lote ${lot}`}
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={note.trim().length < 10} onClick={() => { dispatch({ type: "RELEASE_LOT", lot, note, user: user.id }); toast(`Lote ${lot} liberado: vuelve a asignarse en oleadas`); setOpen(false); }}>Liberar lote</Button></>}>
          <p className="muted">El lote vuelve a asignarse en oleadas desde su ubicación actual.</p>
          <label className="field">Justificación (obligatoria)
            <textarea className="input area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-autofocus placeholder="Ej. Análisis de laboratorio sin hallazgos." />
          </label>
        </Modal>
      </td>
    </tr>
  );
}

function HoldModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [lot, setLot] = useState("");
  const [reason, setReason] = useState("Sospecha de calidad: pendiente de análisis");
  const l = state.lots.find((x) => x.code === lot.trim().toUpperCase());
  return (
    <Modal open onClose={onClose} title="Retener lote por calidad"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!l || !!l.hold || reason.trim().length < 5} onClick={() => { dispatch({ type: "HOLD_LOT", lots: [l!.code], reason, user: user.id }); toast(`Lote ${l!.code} retenido: deja de asignarse`, "warn"); onClose(); }}>Retener</Button></>}>
      <p className="muted">Retención en sitio: el lote no se mueve, pero deja de asignarse en oleadas hasta que calidad lo libere. Para retirar y notificar clientes usa un recall.</p>
      <label className="field">Lote
        <input className="input mono" list="hold-lots" value={lot} onChange={(e) => setLot(e.target.value)} data-autofocus placeholder="Escanea o escribe el lote" />
        <datalist id="hold-lots">{state.lots.filter((x) => !x.hold).map((x) => <option key={x.code} value={x.code}>{x.sku}</option>)}</datalist>
      </label>
      {l?.hold && <div className="banner tone-warn">Este lote ya está retenido ({l.hold.recall ?? l.hold.reason}).</div>}
      <label className="field">Motivo<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Modal>
  );
}
