import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, PackageX, Timer, ClipboardCheck, DoorOpen, Undo2, AlertOctagon, Thermometer } from "lucide-react";
import { alerts, kpis } from "../../core/engine";
import { useStore } from "../../core/store";
import type { OrderStage } from "../../core/types";
import { Avatar, Card, Pill, Progress, Stat } from "../../ui/kit";
import { ago, num, pct, STAGE, STATUS, time } from "../../ui/format";
import { useConsole } from "../ctx";
import { APPT } from "./Docks";

export function Dashboard() {
  const { state } = useStore();
  const { inspect, user } = useConsole();
  const nav = useNavigate();
  const k = useMemo(() => kpis(state), [state]);
  const al = useMemo(() => alerts(state), [state]);

  const stages: OrderStage[] = ["nuevo", "liberado", "en_picking", "surtido", "empacado", "enviado"];
  const today = Date.now() - 24 * 3_600_000;
  const byStage = stages.map((s) => ({
    s, n: state.orders.filter((o) => o.stage === s && (s !== "enviado" || (o.shippedAt ?? 0) > today - 24 * 3_600_000)).length,
  }));

  const ops = state.users.filter((u) => u.role === "operario" || u.role === "empacador");
  const since = Date.now() - 8 * 3_600_000;
  const prod = ops.map((u) => ({
    u,
    lines: state.movements.filter((m) => m.user === u.id && m.ts > since && (m.type === "surtido" || m.type === "empaque")).length,
    open: state.tasks.filter((t) => t.assignee === u.id && t.status !== "completo"),
  }));

  // Surtido por hora (últimas 10 h)
  const hours = Array.from({ length: 10 }, (_, i) => {
    const end = Date.now() - (9 - i) * 3_600_000;
    const start = end - 3_600_000;
    return { label: time(end).slice(0, 2) + "h", n: state.movements.filter((m) => m.type === "surtido" && m.ts > start && m.ts <= end).length };
  });
  const maxH = Math.max(4, ...hours.map((h) => h.n));

  const hello = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches";
  const alertCount = al.exceptions.length + al.late.length + al.approvals.length + al.lowStock.length + al.expiring.length + al.yardWaiting.length + al.creditPending.length + al.openRecalls.length + al.unreviewed.length;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>{hello}, {user.name.split(" ")[0]}</h1>
          <p className="muted">Turno matutino · {alertCount ? `${alertCount} asuntos requieren atención` : "Todo en orden"}</p>
        </div>
      </div>

      <div className="grid-kpi">
        <Stat label="Exactitud de picking" value={pct(k.pickAccuracy)} target="> 99.5 %" tone={k.pickAccuracy >= 0.995 ? "done" : "warn"} onClick={() => nav("/consola/reportes")} />
        <Stat label="Exactitud de inventario" value={pct(k.invAccuracy)} target="> 98 %" tone={k.invAccuracy >= 0.98 ? "done" : "warn"} onClick={() => nav("/consola/conteos")} />
        <Stat label="Tiempo de surtido" value={`${k.fulfillHours.toFixed(1)} h`} target="< 24 h" tone={k.fulfillHours < 24 ? "done" : "warn"} onClick={() => nav("/consola/reportes")} />
        <Stat label="Dock-to-stock" value={`${k.dockToStock.toFixed(1)} h`} hint="Promedio recepciones cerradas" onClick={() => nav("/consola/entradas")} />
        <Stat label="Ocupación" value={pct(k.occupancy, 0)} hint={`${k.occupied} de ${k.storageCount} ubicaciones`} onClick={() => nav("/consola/ubicaciones")} />
      </div>

      <div className="grid-2-1">
        <Card title="Pedidos por estado" actions={<button className="link" onClick={() => nav("/consola/salidas")}>Ver todos</button>}>
          <div className="pipeline">
            {byStage.map(({ s, n }) => (
              <button key={s} className={`pipe tone-${STAGE[s].tone}`} onClick={() => nav(`/consola/salidas?etapa=${s}`)}>
                <strong>{n}</strong><span>{STAGE[s].label}</span>
              </button>
            ))}
          </div>
          <div className="chart-bars" role="img" aria-label={`Líneas surtidas por hora, últimas 10 horas: ${hours.map((h) => `${h.label} ${h.n}`).join(", ")}`}>
            {hours.map((h, i) => (
              <div key={i} className="bar-col" title={`${h.n} líneas`}>
                <div className="bar" style={{ height: `${(h.n / maxH) * 100}%` }}>{h.n > 0 && <span>{h.n}</span>}</div>
                <small>{h.label}</small>
              </div>
            ))}
          </div>
          <div className="muted small">Líneas surtidas por hora (escaneos confirmados en handheld)</div>
        </Card>

        <Card title={<span className="row gap-2"><AlertTriangle size={16} className="t-warn" />Excepciones y alertas</span>}>
          <ul className="alert-list">
            {al.openRecalls.map((r) => (
              <li key={r.id}><AlertOctagon size={16} className="t-blocked" /><div><button className="link" onClick={() => nav("/consola/cumplimiento")}>{r.id}</button> <span className="muted">recall Clase {r.severity}</span><small>Lote {r.lot} · {r.notified.length} cliente(s) notificados</small></div></li>
            ))}
            {al.unreviewed.map((e) => (
              <li key={e.id}><Thermometer size={16} className="t-warn" /><div><button className="link" onClick={() => nav("/consola/cumplimiento")}>Excursión de temperatura</button> <span className="muted">sin evaluar</span><small>{state.sensors.find((x) => x.id === e.sensor)?.name} · pico {e.peak.toFixed(1)} °C · {ago(e.start)}</small></div></li>
            ))}
            {al.exceptions.map((o) => (
              <li key={o.id}><PackageX size={16} className="t-blocked" /><div><button className="link" onClick={() => inspect({ kind: "pedido", id: o.id })}>{o.id}</button> <span className="muted">· {o.customer}</span><small>{o.exception}</small></div></li>
            ))}
            {al.late.map((o) => (
              <li key={"l" + o.id}><Timer size={16} className="t-blocked" /><div><button className="link" onClick={() => inspect({ kind: "pedido", id: o.id })}>{o.id}</button> <span className="muted">atrasado</span><small>Compromiso {ago(o.due)} · {STAGE[o.stage].label}</small></div></li>
            ))}
            {al.yardWaiting.map((a) => (
              <li key={a.id}><DoorOpen size={16} className="t-warn" /><div><button className="link" onClick={() => nav("/consola/andenes")}>{a.party}</button> <span className="muted">espera en patio</span><small>{a.plate} · llegó {ago(a.arrivedAt!)} · sin puerta asignada</small></div></li>
            ))}
            {al.creditPending.map((r) => (
              <li key={r.id}><Undo2 size={16} className="t-warn" /><div><button className="link" onClick={() => inspect({ kind: "rma", id: r.id })}>{r.id}</button> <span className="muted">por acreditar</span><small>{r.customer} · devolución recibida</small></div></li>
            ))}
            {al.approvals.map((c) => (
              <li key={c.id}><ClipboardCheck size={16} className="t-warn" /><div><button className="link" onClick={() => nav("/consola/conteos")}>{c.id}</button> <span className="muted">por aprobar</span><small>Conteo con diferencias</small></div></li>
            ))}
            {al.expiring.map(({ lot, qty }) => (
              <li key={lot.code}><CalendarClock size={16} className="t-warn" /><div><button className="link" onClick={() => inspect({ kind: "lote", id: lot.code })}>{lot.code}</button> <span className="muted">· {lot.sku}</span><small>Caduca {lot.expiryDate} · {num(qty)} pzas</small></div></li>
            ))}
            {al.lowStock.map((p) => (
              <li key={p.sku}><AlertTriangle size={16} className="t-warn" /><div><button className="link" onClick={() => inspect({ kind: "producto", id: p.sku })}>{p.sku}</button> <span className="muted">bajo mínimo</span><small>{p.emoji} {p.name} · mín. {p.min}</small></div></li>
            ))}
            {!alertCount && <li className="muted">Sin alertas.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Oleadas en curso" actions={<button className="link" onClick={() => nav("/consola/oleadas")}>Planear oleada</button>}>
          {state.waves.filter((w) => w.status !== "completo").slice(0, 4).map((w) => {
            const orders = state.orders.filter((o) => o.wave === w.id);
            const done = orders.filter((o) => ["empacado", "enviado"].includes(o.stage)).length;
            const steps = state.tasks.filter((t) => t.type === "surtir").flatMap((t) => t.steps ?? []).filter((st) => orders.some((o) => o.id === st.order));
            const stepsDone = steps.filter((s) => s.status !== "pendiente").length;
            return (
              <div key={w.id} className="wave-row">
                <div className="row between"><strong className="mono">{w.id}</strong><span className="muted small">{w.criteria}</span></div>
                <Progress value={steps.length ? stepsDone / steps.length : 0} tone="progress" />
                <div className="row between small muted"><span>{stepsDone}/{steps.length} líneas surtidas</span><span>{done}/{orders.length} pedidos empacados</span></div>
              </div>
            );
          })}
          {!state.waves.some((w) => w.status !== "completo") && <p className="muted">No hay oleadas activas.</p>}
        </Card>

        <Card title="Productividad del turno" actions={<button className="link" onClick={() => nav("/consola/tareas")}>Asignar tareas</button>}>
          <table className="tbl compact">
            <thead><tr><th>Operario</th><th className="r">Líneas (8 h)</th><th>Tarea actual</th></tr></thead>
            <tbody>
              {prod.map(({ u, lines, open }) => {
                const cur = open.find((t) => t.status === "en_proceso") ?? open[0];
                return (
                  <tr key={u.id}>
                    <td><button className="link row gap-2" onClick={() => inspect({ kind: "usuario", id: u.id })}><Avatar initials={u.initials} />{u.name}</button></td>
                    <td className="r mono">{lines}</td>
                    <td>{cur ? <span className="row gap-2"><Pill tone={STATUS[cur.status].tone}>{STATUS[cur.status].label}</Pill><button className="code is-link" onClick={() => inspect({ kind: "tarea", id: cur.id })}>{cur.id}</button><span className="muted">+{open.length - 1}</span></span> : <span className="muted">Disponible</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Andenes · próximas citas" actions={<button className="link" onClick={() => nav("/consola/andenes")}>Abrir agenda</button>}>
        <div className="dock-strip">
          {state.appointments.filter((a) => a.status !== "cancelada" && a.status !== "completada").sort((a, b) => a.start - b.start).slice(0, 8).map((a) => (
            <button key={a.id} className="dock-slot" onClick={() => inspect({ kind: "cita", id: a.id })}>
              <span className="mono small muted">{time(a.start)} · {a.door ?? "sin puerta"} · {a.kind === "entrada" ? "Descarga" : "Recolección"}</span>
              <strong>{a.party}</strong>
              <span className="row between"><span className="mono small">{a.receipt ?? a.plate ?? a.id}</span><Pill tone={APPT[a.status].tone}>{APPT[a.status].label}</Pill></span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
