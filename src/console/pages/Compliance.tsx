import { useMemo, useState } from "react";
import { AlertOctagon, Thermometer, Barcode, ShieldCheck, CheckCircle2 } from "lucide-react";
import { balancesAt, recallImpact } from "../../core/engine";
import { buildGs1, buildSscc, eanFromGtin, gtinValid, parseGs1 } from "../../core/gs1";
import { useStore, can, whyNot } from "../../core/store";
import type { Recall } from "../../core/types";
import { Button, Card, Code, Empty, Modal, Pill, Progress, Stat, Tabs, useToast } from "../../ui/kit";
import { date, dateTime, num, time, type Tone } from "../../ui/format";
import { useConsole } from "../ctx";
import { TempChart } from "../TempChart";
import { Expiry } from "../Inspector";

const SEV: Record<Recall["severity"], { label: string; desc: string; tone: Tone }> = {
  I: { label: "Clase I", desc: "Riesgo serio para la salud", tone: "blocked" },
  II: { label: "Clase II", desc: "Riesgo temporal o reversible", tone: "warn" },
  III: { label: "Clase III", desc: "Sin riesgo; incumplimiento normativo", tone: "neutral" },
};

type TabId = "recalls" | "temperatura" | "gs1";

export function Compliance() {
  const { state } = useStore();
  const [tab, setTab] = useState<TabId>("recalls");
  const today = new Date().toISOString().slice(0, 10);
  const held = state.lots.filter((l) => l.hold).length;
  const expired = state.lots.filter((l) => l.expiryDate && l.expiryDate < today).length;
  const openR = state.recalls.filter((r) => r.status === "abierto").length;
  const unrev = state.excursions.filter((e) => !e.reviewedBy).length;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Cumplimiento</h1>
          <p className="muted">Recall de lotes con trazabilidad hacia adelante y atrás, monitoreo de temperatura con excursiones y estándares GS1.</p>
        </div>
        <Tabs value={tab} onChange={setTab} items={[
          { id: "recalls", label: "Recalls", count: openR || undefined },
          { id: "temperatura", label: "Temperatura", count: unrev || undefined },
          { id: "gs1", label: "GS1" },
        ]} />
      </div>
      <div className="grid-kpi four">
        <Stat label="Recalls abiertos" value={openR} tone={openR ? "warn" : "done"} hint={`${state.recalls.length} en total`} onClick={() => setTab("recalls")} />
        <Stat label="Lotes retenidos" value={held} hint="No se asignan ni se envían" />
        <Stat label="Excursiones sin evaluar" value={unrev} tone={unrev ? "warn" : "done"} hint={`${state.excursions.length} en 24 h`} onClick={() => setTab("temperatura")} />
        <Stat label="Lotes vencidos" value={expired} hint={state.rules.blockExpired ? "Bloqueados para surtido" : "Sin bloqueo (revisa reglas)"} />
      </div>
      {tab === "recalls" && <Recalls />}
      {tab === "temperatura" && <Temperature />}
      {tab === "gs1" && <Gs1Tools />}
    </div>
  );
}

// ---------------- Recalls ----------------
function Recalls() {
  const { state, bal, dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const reason = can(user.role, "recall.manage") ? undefined : whyNot("recall.manage");

  return (
    <>
      <div className="row between">
        <p className="muted small">Un recall retiene el lote: deja de asignarse en oleadas, se generan tareas urgentes de retiro a cuarentena y se retienen los pedidos que lo contienen.</p>
        <Button variant="danger" icon={<AlertOctagon size={15} />} disabledReason={reason} onClick={() => setOpen(true)}>Iniciar recall</Button>
      </div>
      {!state.recalls.length && <Card><Empty icon={<ShieldCheck size={28} />} title="Sin recalls">Para probar, inicia un recall del lote LCAF2610: está en almacén, en un pedido empacado y ya llegó a clientes.</Empty></Card>}
      {state.recalls.map((r) => {
        const im = recallImpact(state, r.lot, bal);
        const p = state.products.find((x) => x.sku === r.sku);
        const tasks = state.tasks.filter((t) => t.type === "retirar" && t.doc === r.id);
        const doneTasks = tasks.filter((t) => t.status === "completo").length;
        const held = state.orders.filter((o) => o.hold?.includes(r.id));
        const recovered = im.units.quarantine + im.units.disposed;
        const total = Math.max(1, im.received);
        const closed = r.status === "cerrado";
        return (
          <Card key={r.id} title={<span className="row gap-3"><Code>{r.id}</Code><Pill tone={SEV[r.severity].tone}>{SEV[r.severity].label}</Pill>
            <span>{p?.emoji} {p?.name} · lote <Code onClick={() => inspect({ kind: "lote", id: r.lot })}>{r.lot}</Code></span>
            {closed ? <Pill tone="done">Cerrado · {r.disposition === "destruir" ? "destruido" : "devuelto a proveedor"}</Pill> : <Pill tone="blocked">Abierto</Pill>}</span>}
            actions={!closed && <CloseRecall recall={r} disabledReason={reason ?? (doneTasks < tasks.length ? "Faltan retiros por completar en el piso" : held.length ? "Re-surte primero los pedidos retenidos" : undefined)} />}>
            <div className="muted small">{r.reason} · iniciado {dateTime(r.createdAt)} por {state.users.find((u) => u.id === r.createdBy)?.name}</div>
            <div className="recall-grid">
              <div className="recall-box">
                <h4>Retiro en almacén</h4>
                <Progress value={tasks.length ? doneTasks / tasks.length : 1} tone={doneTasks === tasks.length ? "done" : "progress"} />
                <div className="small muted">{doneTasks}/{tasks.length} tareas · {num(im.units.stock)} pzas aún en racks</div>
                {tasks.map((t) => <div key={t.id} className="row between small"><span className="mono">{t.from} → QUA-01</span><Pill tone={t.status === "completo" ? "done" : "pending"}>{t.status === "completo" ? "Retirado" : `${t.qty} pzas`}</Pill></div>)}
              </div>
              <div className="recall-box">
                <h4>Pedidos retenidos</h4>
                {held.map((o) => <div key={o.id} className="row between small"><button className="link mono" onClick={() => inspect({ kind: "pedido", id: o.id })}>{o.id}</button><span className="muted">{o.customer}</span><Button size="sm" onClick={() => inspect({ kind: "pedido", id: o.id })}>Re-surtir…</Button></div>)}
                {!held.length && <div className="small muted">Ninguno.</div>}
                {im.openSteps.length > 0 && <div className="small t-warn">{im.openSteps.length} pasos de surtido aún apuntan al lote</div>}
              </div>
              <div className="recall-box">
                <h4>Recuperación</h4>
                <strong className="big-num">{Math.round((recovered / total) * 100)}%</strong>
                <Progress value={recovered / total} tone={recovered >= total ? "done" : "warn"} />
                <div className="small muted">{num(recovered)} de {num(im.received)} pzas fuera de circulación ({num(im.units.quarantine)} en cuarentena{im.units.disposed ? `, ${num(im.units.disposed)} dispuestas` : ""})</div>
                <div className="small">Pendiente: {num(im.units.stock)} en racks · {num(im.units.process)} retenidas en empaque · {num(im.units.atCustomers)} con clientes</div>
              </div>
            </div>
            <h4 className="sec">Clientes que recibieron el lote ({im.shipped.length})</h4>
            <table className="tbl compact">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Canal</th><th>Enviado</th><th className="r">Pzas del lote</th><th>Notificación</th></tr></thead>
              <tbody>
                {im.shipped.map(({ order: o, qty }) => {
                  const notified = r.notified.includes(o.id);
                  return (
                    <tr key={o.id}>
                      <td><Code onClick={() => inspect({ kind: "pedido", id: o.id })}>{o.id}</Code></td><td>{o.customer}</td><td className="muted">{o.channel}</td>
                      <td className="muted">{o.shippedAt && dateTime(o.shippedAt)}</td><td className="r mono">{qty}</td>
                      <td>{notified ? <Pill tone="done">Notificado · RMA creada</Pill> : (
                        <Button size="sm" disabled={closed} disabledReason={reason} onClick={() => { dispatch({ type: "NOTIFY_RECALL", recall: r.id, order: o.id, user: user.id }); toast(`${o.customer} notificado; se generó RMA de recolección`); }}>Notificar y generar RMA</Button>
                      )}</td>
                    </tr>
                  );
                })}
                {!im.shipped.length && <tr><td colSpan={6} className="muted">El lote no ha salido a clientes.</td></tr>}
              </tbody>
            </table>
          </Card>
        );
      })}
      {open && <StartRecall onClose={() => setOpen(false)} />}
    </>
  );
}

function StartRecall({ onClose }: { onClose: () => void }) {
  const { state, bal, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [lot, setLot] = useState("");
  const [reason, setReason] = useState("Posible contaminación reportada por el proveedor");
  const [sev, setSev] = useState<Recall["severity"]>("II");
  const l = state.lots.find((x) => x.code === lot.trim().toUpperCase());
  const im = useMemo(() => (l ? recallImpact(state, l.code, bal) : null), [state, bal, l]);
  const p = l && state.products.find((x) => x.sku === l.sku);
  const already = l?.hold?.recall;
  const heldOrders = l ? new Set(state.movements.filter((m) => m.lot === l.code && m.type === "surtido" && m.doc).map((m) => m.doc!)) : new Set<string>();
  const toHold = state.orders.filter((o) => heldOrders.has(o.id) && o.stage !== "enviado");

  return (
    <Modal open onClose={onClose} title="Iniciar recall de lote"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" disabled={!l || !!already || !reason} onClick={() => {
          dispatch({ type: "START_RECALL", lot: l!.code, reason, severity: sev, user: user.id });
          toast(`Recall iniciado: lote ${l!.code} retenido, ${im!.inStock.length} retiro(s) enviados al handheld`, "warn");
          onClose();
        }}>Retener lote e iniciar recall</Button>
      </>}>
      <label className="field">Lote
        <input className="input mono" list="recall-lots" value={lot} placeholder="Escanea o escribe el lote" onChange={(e) => setLot(e.target.value)} autoFocus />
        <datalist id="recall-lots">{state.lots.filter((x) => !x.hold).map((x) => <option key={x.code} value={x.code}>{x.sku}</option>)}</datalist>
      </label>
      {l && im && (
        <div className="impact">
          <div className="row gap-2"><strong>{p?.emoji} {p?.name}</strong><span className="muted small">origen {l.origin} · cad. <Expiry iso={l.expiryDate} /></span></div>
          {already && <div className="banner tone-warn">Este lote ya está en el recall {already}.</div>}
          <div className="sec">Análisis de impacto · antes de aplicar</div>
          <div className="preview-grid four">
            <div><strong>{num(im.units.stock)}</strong><span>pzas en {im.inStock.length} ubicación(es) → retiro</span></div>
            <div><strong>{num(im.units.process)}</strong><span>pzas en empaque/staging · {toHold.length} pedido(s) retenidos</span></div>
            <div><strong>{im.openSteps.length}</strong><span>surtidos pendientes que se cancelan</span></div>
            <div><strong>{im.shipped.length}</strong><span>clientes por notificar · {num(im.units.shipped)} pzas</span></div>
          </div>
        </div>
      )}
      <label className="field">Motivo<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="field">Clasificación
        <div className="opts">
          {(Object.keys(SEV) as Recall["severity"][]).map((k) => (
            <label key={k} className={`opt ${sev === k ? "on" : ""}`}><input type="radio" checked={sev === k} onChange={() => setSev(k)} /><span><strong>{SEV[k].label}</strong><small>{SEV[k].desc}</small></span></label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function CloseRecall({ recall, disabledReason }: { recall: Recall; disabledReason?: string }) {
  const { dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [disp, setDisp] = useState<NonNullable<Recall["disposition"]>>("destruir");
  return (
    <>
      <Button size="sm" variant="primary" disabledReason={disabledReason} onClick={() => setOpen(true)}>Cerrar recall</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Cerrar ${recall.id}`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { dispatch({ type: "CLOSE_RECALL", recall: recall.id, disposition: disp, user: user.id }); toast(`${recall.id} cerrado`); setOpen(false); }}>Confirmar disposición</Button></>}>
        <p className="muted">Lo que esté en QUA-01 del lote {recall.lot} sale del inventario con un movimiento de ajuste documentado. Las devoluciones que lleguen después se reciben como merma.</p>
        <div className="opts">
          <label className={`opt ${disp === "destruir" ? "on" : ""}`}><input type="radio" checked={disp === "destruir"} onChange={() => setDisp("destruir")} /><span><strong>Destrucción certificada</strong><small>Se registra salida a merma con acta</small></span></label>
          <label className={`opt ${disp === "devolver_proveedor" ? "on" : ""}`}><input type="radio" checked={disp === "devolver_proveedor"} onChange={() => setDisp("devolver_proveedor")} /><span><strong>Devolver al proveedor</strong><small>Salida a proveedor para nota de cargo</small></span></label>
        </div>
      </Modal>
    </>
  );
}

// ---------------- Temperatura ----------------
function Temperature() {
  const { state, bal, dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [holdLots, setHoldLots] = useState(false);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name;
  const exc = state.excursions.find((e) => e.id === reviewing);
  const excLots = exc ? affectedLots(state.sensors.find((x) => x.id === exc.sensor)?.zone ?? "").filter((b) => !state.lots.find((l) => l.code === b.lot)?.hold) : [];

  // Lotes sensibles (con caducidad) que estaban en la zona durante la excursión
  function affectedLots(zone: string) {
    const locs = state.locations.filter((l) => l.zone === zone).map((l) => l.code);
    return locs.flatMap((l) => balancesAt(bal, l)).filter((b) => state.products.find((p) => p.sku === b.sku)?.expiryTracked && b.lot);
  }

  return (
    <>
      <Card title={<span className="row gap-2"><Thermometer size={16} />Excursiones de temperatura (24 h)</span>} pad={false}>
        <table className="tbl">
          <thead><tr><th>Sensor</th><th>Inicio</th><th>Fin</th><th className="r">Pico</th><th>Rango</th><th>Lotes sensibles en zona</th><th>Evaluación</th></tr></thead>
          <tbody>{state.excursions.map((e) => {
            const se = state.sensors.find((x) => x.id === e.sensor)!;
            const lots = affectedLots(se.zone);
            return (
              <tr key={e.id}>
                <td><strong>{se.name}</strong></td>
                <td className="muted">{dateTime(e.start)}</td><td className="muted">{time(e.end)}</td>
                <td className="r mono t-blocked">{e.peak.toFixed(1)} °C</td>
                <td className="muted">{se.min}–{se.max} °C</td>
                <td><div className="chips">{lots.slice(0, 4).map((b) => <button key={b.loc + b.lot} className="chip mono small" onClick={() => inspect({ kind: "lote", id: b.lot! })}>{b.lot}</button>)}{!lots.length && <span className="muted small">Ninguno</span>}{lots.length > 4 && <span className="muted small">+{lots.length - 4}</span>}</div></td>
                <td>{e.reviewedBy ? <span className="small"><Pill tone="done">Evaluada</Pill> {name(e.reviewedBy)}<div className="muted">{e.note}</div></span>
                  : <Button size="sm" variant="primary" onClick={() => { setReviewing(e.id); setNote(""); setHoldLots(false); }}>Evaluar</Button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
      <div className="grid-2">
        {state.sensors.map((se) => {
          const last = se.readings[se.readings.length - 1];
          const outNow = last.t > se.max || last.t < se.min;
          return (
            <Card key={se.id} title={se.name} actions={<span className="row gap-2 small"><strong className={outNow ? "t-blocked" : ""}>{last.t.toFixed(1)} °C</strong><span className="muted">{last.h}% HR · rango {se.min}–{se.max} °C</span></span>}>
              <TempChart sensor={se} />
            </Card>
          );
        })}
      </div>
      <Modal open={!!exc} onClose={() => setReviewing(null)} title="Evaluar excursión"
        footer={<><Button variant="ghost" onClick={() => setReviewing(null)}>Cancelar</Button>
          <Button variant="primary" disabled={note.trim().length < 8} onClick={() => {
            dispatch({ type: "REVIEW_EXCURSION", excursion: exc!.id, note: note.trim(), user: user.id });
            const lots = [...new Set(excLots.map((b) => b.lot!))];
            if (holdLots && lots.length) dispatch({ type: "HOLD_LOT", lots, reason: `Excursión de temperatura ${exc!.id}: pendiente de análisis`, user: user.id });
            toast(holdLots && lots.length ? `Evaluación registrada; ${lots.length} lote(s) retenidos por calidad` : "Evaluación registrada en la bitácora", holdLots ? "warn" : "ok");
            setReviewing(null);
          }}>Registrar evaluación</Button></>}>
        {exc && <p className="muted">{state.sensors.find((s) => s.id === exc.sensor)?.name}: pico de {exc.peak.toFixed(1)} °C entre {time(exc.start)} y {time(exc.end)}. Indica causa, productos revisados y decisión (liberar o iniciar recall).</p>}
        <textarea className="input area" rows={4} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Evaluación de la excursión" data-autofocus placeholder="Ej. Falla del A/C 2 h; lotes revisados sin afectación, se liberan." />
        {excLots.length > 0 && (
          <label className="check"><input type="checkbox" checked={holdLots} onChange={(e) => setHoldLots(e.target.checked)} />
            Retener por calidad los {new Set(excLots.map((b) => b.lot)).size} lote(s) sensibles de la zona ({[...new Set(excLots.map((b) => b.lot))].slice(0, 4).join(", ")}{new Set(excLots.map((b) => b.lot)).size > 4 ? "…" : ""})</label>
        )}
      </Modal>
    </>
  );
}

// ---------------- GS1 ----------------
function Gs1Tools() {
  const { state } = useStore();
  const sample = buildGs1(state.products[0].barcode, "LCAF2701", state.lots.find((l) => l.code === "LCAF2701")?.expiryDate, 120);
  const [code, setCode] = useState(sample);
  const [sku, setSku] = useState(state.products[0].sku);
  const parsed = parseGs1(code);
  const prod = parsed?.gtin && state.products.find((p) => p.barcode === eanFromGtin(parsed.gtin!));
  const gp = state.products.find((p) => p.sku === sku)!;
  const gLot = state.lots.find((l) => l.sku === sku && !l.hold);
  const label = buildGs1(gp.barcode, gLot?.code, gLot?.expiryDate, gp.packs[0].factor);
  const sscc = buildSscc("750100", 4821 + state.seq);

  return (
    <div className="grid-2">
      <Card title={<span className="row gap-2"><Barcode size={16} />Validador GS1-128</span>}>
        <p className="muted small">Pega o escanea una etiqueta (formato legible con paréntesis o cadena cruda). El handheld usa este mismo parser al recibir.</p>
        <input className="input lg" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Código GS1" />
        {parsed ? (
          <table className="tbl compact">
            <thead><tr><th>AI</th><th>Elemento</th><th>Valor</th></tr></thead>
            <tbody>{parsed.elements.map((e, i) => <tr key={i}><td className="mono">({e.ai})</td><td>{e.label}</td><td className="mono">{e.value}{e.ai === "17" && parsed.expiry && <span className="muted"> → {date(parsed.expiry)}</span>}</td></tr>)}</tbody>
          </table>
        ) : <div className="banner tone-warn">No es una etiqueta GS1 válida (debe iniciar con AI 00, 01 o 02).</div>}
        {parsed?.gtin && (
          <div className="small gs1-match">
            {prod ? <><CheckCircle2 size={15} className="t-done" /><span>Corresponde a {prod.emoji} <strong>{prod.name}</strong> ({prod.sku})</span></> : <span className="t-warn">GTIN sin producto en el maestro</span>}
            <span className="muted">Dígito verificador: {gtinValid(parsed.gtin) ? "válido" : "no válido (EAN de demostración)"}</span>
          </div>
        )}
      </Card>
      <Card title="Generador de etiquetas">
        <label className="field">Producto
          <select className="input" value={sku} onChange={(e) => setSku(e.target.value)}>{state.products.map((p) => <option key={p.sku} value={p.sku}>{p.sku} · {p.name}</option>)}</select>
        </label>
        <div className="label-preview">
          <div className="lp-row"><span>Producto</span><strong>{gp.name}</strong></div>
          <div className="lp-row"><span>Lote / Cad.</span><strong className="mono">{gLot?.code ?? "—"} · {gLot?.expiryDate ?? "—"}</strong></div>
          <div className="lp-row"><span>Contenido</span><strong>{gp.packs[0].factor} {gp.uom} ({gp.packs[0].uom})</strong></div>
          <div className="lp-bars" aria-hidden />
          <code className="lp-hri">{label}</code>
        </div>
        <div className="small muted">Etiqueta de tarima (SSCC): <code className="code">(00){sscc}</code></div>
        <Button size="sm" onClick={() => setCode(label)}>Probar en el validador</Button>
      </Card>
    </div>
  );
}
