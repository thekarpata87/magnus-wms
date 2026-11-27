// Panel lateral universal: drill-down entre entidades (KPI → pedido → línea → movimiento → usuario).
import { useMemo } from "react";
import { balancesAt, balancesOf, locQty } from "../core/engine";
import { useStore } from "../core/store";
import type { Movement } from "../core/types";
import { Code, Drawer, Pill, Progress } from "../ui/kit";
import { ago, date, dateTime, daysUntil, MOVE_LABEL, num, STAGE, STATUS, TASK_LABEL } from "../ui/format";
import type { InspectTarget } from "./ctx";
import { APPT } from "./pages/Docks";
import { CONDITION, DISPOSITION } from "./pages/Returns";
import { ReworkPanel } from "./Rework";

export function Inspector({ target, onClose, onNavigate }: { target: InspectTarget | null; onClose: () => void; onNavigate: (t: InspectTarget) => void }) {
  if (!target) return null;
  return <InspectorBody key={target.kind + target.id} target={target} onClose={onClose} go={onNavigate} />;
}

function InspectorBody({ target, onClose, go }: { target: InspectTarget; onClose: () => void; go: (t: InspectTarget) => void }) {
  const { state, bal } = useStore();
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;

  const moves = useMemo(() => {
    const t = target;
    return state.movements.filter((m) =>
      t.kind === "producto" ? m.sku === t.id
      : t.kind === "ubicacion" ? m.from === t.id || m.to === t.id
      : t.kind === "lote" ? m.lot === t.id
      : t.kind === "pedido" || t.kind === "recepcion" || t.kind === "rma" ? m.doc === t.id
      : t.kind === "usuario" ? m.user === t.id : false,
    ).slice(-40).reverse();
  }, [state.movements, target]);

  const MoveTable = ({ rows }: { rows: Movement[] }) => (
    <table className="tbl compact">
      <thead><tr><th>Hora</th><th>Tipo</th><th>SKU</th><th>Origen → destino</th><th className="r">Cant.</th><th>Usuario</th></tr></thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="muted nowrap">{dateTime(m.ts)}</td>
            <td>{MOVE_LABEL[m.type]}</td>
            <td><Code onClick={() => go({ kind: "producto", id: m.sku })}>{m.sku}</Code></td>
            <td className="nowrap">
              <LocLink code={m.from} go={go} /> <span className="muted">→</span> <LocLink code={m.to} go={go} />
            </td>
            <td className="r mono">{num(m.qty)}</td>
            <td><button className="link" onClick={() => go({ kind: "usuario", id: m.user })}>{userName(m.user)}</button></td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={6} className="muted">Sin movimientos.</td></tr>}
      </tbody>
    </table>
  );

  if (target.kind === "producto") {
    const p = state.products.find((x) => x.sku === target.id);
    if (!p) return null;
    const rows = balancesOf(bal, p.sku);
    const total = rows.reduce((s, b) => s + b.qty, 0);
    const reserved = rows.reduce((s, b) => s + b.reserved, 0);
    return (
      <Drawer open onClose={onClose} wide title={<span className="row gap-3"><span className="emoji-lg">{p.emoji}</span>{p.name}</span>} subtitle={<span className="mono">{p.sku} · EAN {p.barcode}</span>}>
        <div className="kv-grid">
          <KV k="Existencia" v={num(total)} /><KV k="Reservado" v={num(reserved)} /><KV k="Disponible" v={num(total - reserved)} />
          <KV k="Mín / Máx" v={`${p.min} / ${p.max}`} /><KV k="Clase ABC" v={p.abc} /><KV k="Zona preferida" v={p.preferredZone} />
          <KV k="Unidades" v={[`1 ${p.uom}`, ...p.packs.map((x) => `${x.uom} = ${x.factor}`)].join(" · ")} />
          <KV k="Política" v={[p.lotTracked && "Lote", p.expiryTracked && "Caducidad"].filter(Boolean).join(" + ") || "Sin lote"} />
          <KV k="Peso" v={`${p.weightKg} kg`} />
        </div>
        <h4 className="sec">Existencias por ubicación y lote</h4>
        <table className="tbl compact">
          <thead><tr><th>Ubicación</th><th>Lote</th><th>Caducidad</th><th className="r">Cant.</th><th className="r">Reserv.</th></tr></thead>
          <tbody>{rows.map((b) => {
            const lot = state.lots.find((l) => l.code === b.lot);
            return (
              <tr key={b.loc + b.lot}>
                <td><LocLink code={b.loc} go={go} /></td>
                <td>{b.lot ? <Code onClick={() => go({ kind: "lote", id: b.lot! })}>{b.lot}</Code> : <span className="muted">—</span>}</td>
                <td><Expiry iso={lot?.expiryDate} /></td>
                <td className="r mono">{num(b.qty)}</td><td className="r mono muted">{b.reserved || "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <h4 className="sec">Kardex (últimos movimientos)</h4>
        <MoveTable rows={moves} />
      </Drawer>
    );
  }

  if (target.kind === "ubicacion") {
    const l = state.locations.find((x) => x.code === target.id);
    if (!l) return null;
    const here = balancesAt(bal, l.code);
    const used = locQty(bal, l.code);
    return (
      <Drawer open onClose={onClose} wide title={<span className="mono">{l.code}</span>} subtitle={`Zona ${l.zone}${l.aisle ? ` · Pasillo ${l.aisle} · Rack ${l.rack} · Nivel ${l.level}` : ""} · ${l.type}`}>
        <div className="kv-grid">
          <KV k="Ocupación" v={`${num(used)} / ${num(l.capacity)}`} /><KV k="Estado" v={l.blocked ? <Pill tone="blocked">Bloqueada</Pill> : <Pill tone="done">Activa</Pill>} />
          <KV k="SKU distintos" v={new Set(here.map((b) => b.sku)).size} />
        </div>
        <Progress value={used / l.capacity} tone={used / l.capacity > 0.9 ? "warn" : "brand"} />
        <h4 className="sec">Contenido</h4>
        <table className="tbl compact">
          <thead><tr><th>Producto</th><th>Lote</th><th className="r">Cant.</th><th className="r">Reserv.</th></tr></thead>
          <tbody>
            {here.map((b) => {
              const p = state.products.find((x) => x.sku === b.sku);
              return (
                <tr key={b.sku + b.lot}>
                  <td><button className="link" onClick={() => go({ kind: "producto", id: b.sku })}>{p?.emoji} {p?.name}</button> <span className="mono muted">{b.sku}</span></td>
                  <td>{b.lot ? <Code onClick={() => go({ kind: "lote", id: b.lot! })}>{b.lot}</Code> : "—"}</td>
                  <td className="r mono">{num(b.qty)}</td><td className="r mono muted">{b.reserved || "—"}</td>
                </tr>
              );
            })}
            {!here.length && <tr><td colSpan={4} className="muted">Ubicación vacía.</td></tr>}
          </tbody>
        </table>
        <h4 className="sec">Movimientos</h4>
        <MoveTable rows={moves} />
      </Drawer>
    );
  }

  if (target.kind === "lote") {
    const lot = state.lots.find((x) => x.code === target.id);
    if (!lot) return null;
    const p = state.products.find((x) => x.sku === lot.sku);
    const orders = [...new Set(state.movements.filter((m) => m.lot === lot.code && m.type === "surtido" && m.doc).map((m) => m.doc!))];
    const where = [...bal.values()].filter((b) => b.lot === lot.code && b.qty > 0);
    return (
      <Drawer open onClose={onClose} wide title={<span className="mono">{lot.code}</span>} subtitle={`${p?.emoji} ${p?.name}`}>
        <div className="kv-grid">
          <KV k="Estado" v={lot.hold ? <Pill tone="blocked">Retenido · {lot.hold.recall ?? lot.hold.reason}</Pill> : <Pill tone="done">Liberado</Pill>} />
          <KV k="Fabricación" v={date(lot.mfgDate)} /><KV k="Caducidad" v={<Expiry iso={lot.expiryDate} />} />
          <KV k="Origen" v={lot.origin.startsWith("OC") ? <Code onClick={() => go({ kind: "recepcion", id: lot.origin })}>{lot.origin}</Code> : lot.origin} />
        </div>
        <h4 className="sec">Hacia atrás · dónde está hoy</h4>
        <div className="chips">{where.map((b) => <button key={b.loc} className="chip" onClick={() => go({ kind: "ubicacion", id: b.loc })}><span className="mono">{b.loc}</span> · {num(b.qty)}</button>)}{!where.length && <span className="muted">Sin existencia.</span>}</div>
        <h4 className="sec">Hacia adelante · pedidos que lo recibieron</h4>
        <div className="chips">{orders.map((o) => <button key={o} className="chip" onClick={() => go({ kind: "pedido", id: o })}><span className="mono">{o}</span> · {state.orders.find((x) => x.id === o)?.customer}</button>)}{!orders.length && <span className="muted">Aún no se ha surtido.</span>}</div>
        <h4 className="sec">Movimientos del lote</h4>
        <MoveTable rows={moves} />
      </Drawer>
    );
  }

  if (target.kind === "pedido") {
    const o = state.orders.find((x) => x.id === target.id);
    if (!o) return null;
    const task = state.tasks.filter((t) => t.type === "surtir" && t.steps?.some((st) => st.order === o.id)).at(-1);
    const tote = task?.totes?.find((x) => x.order === o.id)?.tote;
    const steps = ["Nuevo", "Liberado", "En picking", "Surtido", "Empacado", "Enviado"];
    return (
      <Drawer open onClose={onClose} wide title={<span className="mono">{o.id}</span>} subtitle={`${o.customer} · ${o.channel} · ${o.carrier}`}>
        <ol className="stepper">
          {steps.map((s, i) => <li key={s} aria-current={i === STAGE[o.stage].step ? "step" : undefined} className={i < STAGE[o.stage].step ? "done" : i === STAGE[o.stage].step ? "now" : ""}>{s}{i < STAGE[o.stage].step && <span className="sr-only"> (completado)</span>}</li>)}
        </ol>
        {o.exception && !o.hold && <div className="banner tone-blocked">{o.exception}</div>}
        <ReworkPanel orderId={o.id} />
        <div className="kv-grid">
          <KV k="Prioridad" v={o.priority === "alta" ? <Pill tone="warn">Alta</Pill> : "Normal"} />
          <KV k="Compromiso" v={<span className={o.due < Date.now() && o.stage !== "enviado" ? "t-blocked" : ""}>{dateTime(o.due)} ({ago(o.due)})</span>} />
          <KV k="Oleada" v={o.wave ?? "—"} />
          <KV k="Tarea de surtido" v={task ? <><Code onClick={() => go({ kind: "tarea", id: task.id })}>{task.id}</Code>{task.mode && task.mode !== "pedido" && <span className="muted small"> · {task.mode}{tote && ` · contenedor ${tote}`}</span>}</> : "—"} />
          <KV k="Guía" v={o.boxes?.map((b) => `${b.tracking} (${b.size}, ${b.weightKg.toFixed(1)} kg)`).join(", ") || "—"} />
        </div>
        <h4 className="sec">Líneas</h4>
        <table className="tbl compact">
          <thead><tr><th>Producto</th><th className="r">Pedida</th><th className="r">Surtida</th><th className="r">Empacada</th><th className="r">Faltante</th></tr></thead>
          <tbody>{o.lines.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku);
            return (
              <tr key={l.sku}>
                <td><button className="link" onClick={() => go({ kind: "producto", id: l.sku })}>{p?.emoji} {p?.name}</button></td>
                <td className="r mono">{l.qty}</td><td className="r mono">{l.picked}</td><td className="r mono">{l.packed}</td>
                <td className={`r mono ${l.short ? "t-blocked" : "muted"}`}>{l.short || "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <h4 className="sec">Movimientos del pedido</h4>
        <MoveTable rows={moves} />
      </Drawer>
    );
  }

  if (target.kind === "recepcion") {
    const r = state.receipts.find((x) => x.id === target.id);
    if (!r) return null;
    return (
      <Drawer open onClose={onClose} wide title={<span className="mono">{r.id}</span>} subtitle={`${r.supplier}${r.asn ? ` · ${r.asn}` : ""}`}>
        <div className="kv-grid">
          <KV k="Estado" v={<Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>} />
          <KV k="Andén" v={<LocLink code={r.dock} go={go} />} /><KV k="Cita" v={dateTime(r.appointment)} />
          <KV k="Llegada" v={r.arrivedAt ? dateTime(r.arrivedAt) : "—"} /><KV k="Cierre" v={r.completedAt ? dateTime(r.completedAt) : "—"} />
        </div>
        <h4 className="sec">Esperado vs. recibido</h4>
        <table className="tbl compact">
          <thead><tr><th>Producto</th><th>Lote</th><th className="r">Esperado</th><th className="r">Recibido</th><th className="r">Dif.</th></tr></thead>
          <tbody>{r.lines.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku);
            const d = l.received - l.expected;
            return (
              <tr key={l.sku}>
                <td><button className="link" onClick={() => go({ kind: "producto", id: l.sku })}>{p?.emoji} {p?.name}</button></td>
                <td>{l.lot ? <Code onClick={() => go({ kind: "lote", id: l.lot! })}>{l.lot}</Code> : "—"}</td>
                <td className="r mono">{l.expected}</td><td className="r mono">{l.received}</td>
                <td className={`r mono ${d && r.status === "completo" ? "t-blocked" : "muted"}`}>{d ? d : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <h4 className="sec">Movimientos (recepción y ubicación)</h4>
        <MoveTable rows={moves} />
      </Drawer>
    );
  }

  if (target.kind === "tarea") {
    const t = state.tasks.find((x) => x.id === target.id);
    if (!t) return null;
    return (
      <Drawer open onClose={onClose} title={<span className="mono">{t.id}</span>} subtitle={`${TASK_LABEL[t.type]} · documento ${t.doc}`}>
        <div className="kv-grid">
          <KV k="Estado" v={<Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>} />
          <KV k="Asignada a" v={t.assignee ? userName(t.assignee) : "Sin asignar"} />
          <KV k="Prioridad" v={`P${t.priority}`} /><KV k="Creada" v={ago(t.createdAt)} />
        </div>
        {t.type === "ubicar" && (
          <div className="kv-grid">
            <KV k="Producto" v={t.sku} /><KV k="Cantidad" v={t.qty} /><KV k="Desde" v={t.from} /><KV k="Sugerida" v={<LocLink code={t.suggested ?? "—"} go={go} />} />
          </div>
        )}
        {t.steps && (
          <table className="tbl compact">
            <thead><tr><th>#</th><th>Ubicación</th><th>SKU</th><th>Lote</th><th className="r">Cant.</th><th>Estado</th></tr></thead>
            <tbody>{t.steps.map((s, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td><td><LocLink code={s.from} go={go} /></td><td className="mono">{s.sku}</td>
                <td className="mono muted">{s.lot ?? "—"}</td><td className="r mono">{s.done}/{s.qty}</td>
                <td><Pill tone={s.status === "hecho" ? "done" : s.status === "faltante" ? "blocked" : "pending"}>{s.status}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {t.locations && <div className="chips">{t.locations.map((l) => <button key={l} className="chip mono" onClick={() => go({ kind: "ubicacion", id: l })}>{l}</button>)}</div>}
      </Drawer>
    );
  }

  if (target.kind === "rma") {
    const r = state.rmas.find((x) => x.id === target.id);
    if (!r) return null;
    return (
      <Drawer open onClose={onClose} wide title={<span className="mono">{r.id}</span>} subtitle={`${r.customer} · ${r.reason}`}>
        <div className="kv-grid">
          <KV k="Pedido original" v={<Code onClick={() => go({ kind: "pedido", id: r.order })}>{r.order}</Code>} />
          <KV k="Autorizó" v={userName(r.createdBy)} /><KV k="Autorizada" v={dateTime(r.createdAt)} />
          <KV k="Recibida" v={r.receivedAt ? dateTime(r.receivedAt) : "Esperando paquete"} />
          <KV k="Nota de crédito" v={r.credit ? `${dateTime(r.credit.at)} · ${userName(r.credit.by)}` : "Pendiente"} />
        </div>
        <h4 className="sec">Líneas, inspección y disposición</h4>
        <table className="tbl compact">
          <thead><tr><th>Producto</th><th>Lote</th><th className="r">Autorizado</th><th className="r">Recibido</th><th>Condición</th><th>Disposición</th></tr></thead>
          <tbody>{r.lines.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku);
            return (
              <tr key={l.sku}>
                <td><button className="link" onClick={() => go({ kind: "producto", id: l.sku })}>{p?.emoji} {p?.name}</button></td>
                <td>{l.lot ? <Code onClick={() => go({ kind: "lote", id: l.lot! })}>{l.lot}</Code> : "—"}</td>
                <td className="r mono">{l.qty}</td><td className="r mono">{l.received}</td>
                <td>{l.condition ? <Pill tone={CONDITION[l.condition].tone}>{CONDITION[l.condition].label}</Pill> : "—"}</td>
                <td className="small">{l.disposition ? DISPOSITION[l.disposition] : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <h4 className="sec">Movimientos</h4>
        <MoveTable rows={moves} />
      </Drawer>
    );
  }

  if (target.kind === "cita") {
    const ap = state.appointments.find((x) => x.id === target.id);
    if (!ap) return null;
    return (
      <Drawer open onClose={onClose} title={<span className="mono">{ap.id}</span>} subtitle={`${ap.kind === "entrada" ? "Descarga" : "Recolección"} · ${ap.party}`}>
        <div className="kv-grid">
          <KV k="Estado" v={<Pill tone={APPT[ap.status].tone}>{APPT[ap.status].label}</Pill>} />
          <KV k="Puerta" v={ap.door ?? "—"} /><KV k="Placas" v={ap.plate ?? "—"} />
          <KV k="Cita" v={dateTime(ap.start)} /><KV k="Llegada" v={ap.arrivedAt ? dateTime(ap.arrivedAt) : "—"} />
          <KV k="Salida" v={ap.doneAt ? dateTime(ap.doneAt) : "—"} />
        </div>
        {ap.receipt && <button className="link" onClick={() => go({ kind: "recepcion", id: ap.receipt! })}>Ver recepción {ap.receipt} →</button>}
        {!!ap.loaded?.length && <div className="chips">{ap.loaded.map((o) => <button key={o} className="chip mono" onClick={() => go({ kind: "pedido", id: o })}>{o}</button>)}</div>}
      </Drawer>
    );
  }

  // usuario
  const u = state.users.find((x) => x.id === target.id);
  if (!u) return null;
  return (
    <Drawer open onClose={onClose} wide title={u.name} subtitle={`${u.role} · turno ${u.shift}`}>
      <div className="kv-grid">
        <KV k="Movimientos (total)" v={state.movements.filter((m) => m.user === u.id).length} />
        <KV k="Líneas surtidas" v={state.movements.filter((m) => m.user === u.id && m.type === "surtido").length} />
        <KV k="Tareas abiertas" v={state.tasks.filter((t) => t.assignee === u.id && t.status !== "completo").length} />
      </div>
      <h4 className="sec">Últimos movimientos</h4>
      <MoveTable rows={moves} />
    </Drawer>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="kv"><span>{k}</span><strong>{v}</strong></div>;
}

function LocLink({ code, go }: { code: string; go: (t: InspectTarget) => void }) {
  if (["PROV", "CLIENTE", "AJUSTE", "—"].includes(code)) return <span className="mono muted">{code}</span>;
  return <button className="code is-link" onClick={() => go({ kind: "ubicacion", id: code })}>{code}</button>;
}

export function Expiry({ iso }: { iso?: string }) {
  if (!iso) return <span className="muted">—</span>;
  const d = daysUntil(iso);
  return <span className={d <= 30 ? "t-warn" : ""}>{date(iso)}{d <= 30 && ` · ${d} d`}</span>;
}
