// Re-surtido de un pedido afectado por un lote retenido. Vista previa → aplicar.
import { useMemo } from "react";
import { AlertOctagon, PackageOpen, RotateCcw } from "lucide-react";
import { needsRework, pendingWithdraw, reworkPlan } from "../core/engine";
import { useStore, can, whyNot } from "../core/store";
import { Button, Pill, useToast } from "../ui/kit";
import { useConsole } from "./ctx";

export function ReworkPanel({ orderId }: { orderId: string }) {
  const { state, bal, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const o = state.orders.find((x) => x.id === orderId);
  const plan = useMemo(() => (o && needsRework(o) ? reworkPlan(state, o.id, bal) : null), [state, bal, o]);
  const waiting = o ? state.tasks.filter((t) => t.type === "retirar" && t.orderRef === o.id && t.status !== "completo") : [];

  if (o && !plan && waiting.length)
    return (
      <div className="rework waiting">
        <div className="row gap-2"><PackageOpen size={16} /><strong>Esperando retiro del lote retenido</strong></div>
        <div className="small muted">El empaque se habilita cuando el piso lleve a QUA-01: {waiting.map((t) => `${t.qty} × ${t.lot} desde ${t.from}`).join(" · ")}</div>
      </div>
    );
  if (!o || !plan) return null;

  return (
    <div className="rework">
      <div className="row gap-2"><AlertOctagon size={16} className="t-blocked" /><strong>Pedido retenido por recall</strong>
        <span className="muted small">{o.hold ?? o.exception}</span></div>
      <div className="sec">Plan de re-surtido · vista previa</div>
      <table className="tbl compact">
        <thead><tr><th>Producto</th><th className="r">Pedido</th><th className="r">Se conserva</th><th>A cuarentena</th><th>Reponer desde</th></tr></thead>
        <tbody>{plan.lines.map((l) => {
          const p = state.products.find((x) => x.sku === l.sku);
          return (
            <tr key={l.sku}>
              <td>{p?.emoji} {p?.name}</td>
              <td className="r mono">{l.qty}</td>
              <td className="r mono">{l.good + l.pending || "—"}</td>
              <td>{l.held.map((h) => <div key={h.loc + h.lot} className="small"><Pill tone="blocked" dot={false}>{h.qty} × {h.lot}</Pill> <span className="mono muted">{h.loc}</span></div>)}{!l.held.length && <span className="muted">—</span>}</td>
              <td>{l.picks.map((pk) => <div key={pk.loc + pk.lot} className="small mono">{pk.qty} × {pk.lot ?? "s/lote"} · {pk.loc}</div>)}
                {l.short > 0 && <Pill tone="warn">Sin existencia: {l.short}</Pill>}{!l.picks.length && !l.short && <span className="muted">—</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <ul className="rework-steps">
        {plan.unpack && <li>Se abre la caja y se anula la guía {plan.boxes.map((b) => b.tracking).join(", ") || "—"}; lo que sirve regresa a PACK-01.</li>}
        {plan.heldUnits > 0 && <li>{plan.heldUnits} pzas del lote retenido van a QUA-01 con una tarea urgente en el handheld.</li>}
        {plan.replaceUnits > 0 && <li>Se repone {plan.replaceUnits} pzas con lotes liberados ({state.rules.removal}) en {plan.stops} parada(s), prioridad P1.</li>}
        {plan.shortUnits > 0 && <li className="t-warn">{plan.shortUnits} pzas no tienen existencia liberada: el pedido saldrá incompleto o espera reabasto.</li>}
        <li>Después: empacar de nuevo y cargar en el andén de {o.carrier}.</li>
      </ul>
      <Button variant="primary" icon={<RotateCcw size={15} />} disabled={pendingWithdraw(state, o.id)}
        disabledReason={can(user.role, "order.rework") ? undefined : whyNot("order.rework")}
        onClick={() => { dispatch({ type: "REWORK_ORDER", order: o.id, user: user.id }); toast(`${o.id} en re-surtido: ${plan.heldUnits} pzas a cuarentena, ${plan.replaceUnits} por reponer`); }}>
        Re-surtir pedido
      </Button>
    </div>
  );
}
