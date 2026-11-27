import { useState } from "react";
import { Plus, Undo2, ShieldAlert } from "lucide-react";
import { balancesAt, returnable } from "../../core/engine";
import { useStore, can, whyNot } from "../../core/store";
import type { Condition, Disposition } from "../../core/types";
import { Button, Card, Code, Empty, Modal, Pill, Progress, Tabs, useToast } from "../../ui/kit";
import { ago, dateTime, num, STATUS, type Tone } from "../../ui/format";
import { useConsole } from "../ctx";

export const CONDITION: Record<Condition, { label: string; tone: Tone }> = {
  buena: { label: "Buena", tone: "done" }, danada: { label: "Dañada", tone: "blocked" }, defectuosa: { label: "Defectuosa", tone: "warn" },
};
export const DISPOSITION: Record<Disposition, string> = { reubicar: "Reubicar a stock", cuarentena: "Cuarentena (QUA-01)", desechar: "Desechar" };
export const REASONS = ["Llegó dañado en tránsito", "No enciende (garantía)", "Producto defectuoso", "Error del cliente al pedir", "Artículo equivocado enviado", "Ya no lo quiere"];

export function Returns() {
  const { state, bal, dispatch } = useStore();
  const { user, inspect } = useConsole();
  const toast = useToast();
  const [tab, setTab] = useState<"abiertas" | "todas">("abiertas");
  const [creating, setCreating] = useState(false);
  const rows = state.rmas.filter((r) => tab === "todas" || r.status !== "completo");
  const quarantine = balancesAt(bal, "QUA-01");

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Devoluciones</h1>
          <p className="muted">Logística inversa: autorización (RMA), recepción en handheld con inspección, disposición y nota de crédito.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} disabledReason={can(user.role, "rma.create") ? undefined : whyNot("rma.create")} onClick={() => setCreating(true)}>Autorizar devolución</Button>
      </div>

      <Card pad={false} title={<Tabs value={tab} onChange={setTab} items={[
        { id: "abiertas", label: "Abiertas", count: state.rmas.filter((r) => r.status !== "completo").length },
        { id: "todas", label: "Todas", count: state.rmas.length },
      ]} />}>
        {rows.length ? (
          <table className="tbl">
            <thead><tr><th>RMA</th><th>Pedido / cliente</th><th>Motivo</th><th>Artículos</th><th style={{ width: 130 }}>Recibido</th><th>Estado</th><th></th></tr></thead>
            <tbody>{rows.map((r) => {
              const qty = r.lines.reduce((n, l) => n + l.qty, 0);
              const rec = r.lines.reduce((n, l) => n + l.received, 0);
              const ready = r.status === "en_proceso" && rec >= qty;
              return (
                <tr key={r.id} className="clickable" onClick={() => inspect({ kind: "rma", id: r.id })}>
                  <td><Code>{r.id}</Code><div className="muted small">{ago(r.createdAt)}</div></td>
                  <td><Code onClick={() => inspect({ kind: "pedido", id: r.order })}>{r.order}</Code><div className="small">{r.customer}</div></td>
                  <td className="small">{r.reason}</td>
                  <td>{r.lines.map((l) => {
                    const p = state.products.find((x) => x.sku === l.sku);
                    return <div key={l.sku} className="small row gap-2">{p?.emoji} {l.qty} × {l.sku}{l.condition && <Pill tone={CONDITION[l.condition].tone}>{CONDITION[l.condition].label}</Pill>}{l.disposition && <span className="muted">→ {DISPOSITION[l.disposition]}</span>}</div>;
                  })}</td>
                  <td><Progress value={rec / qty} tone={rec >= qty ? "done" : "progress"} /><div className="small muted">{rec}/{qty} pzas</div></td>
                  <td>{r.credit ? <Pill tone="done">Acreditada</Pill> : ready ? <Pill tone="warn">Por acreditar</Pill> : r.status === "pendiente" ? <Pill tone="pending">Esperando paquete</Pill> : <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>}</td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    {ready && <Button size="sm" variant="primary" disabledReason={can(user.role, "rma.credit") ? undefined : whyNot("rma.credit")}
                      onClick={() => { dispatch({ type: "ISSUE_CREDIT", rma: r.id, user: user.id }); toast(`Nota de crédito emitida para ${r.customer}; enviada al ERP`); }}>Emitir nota de crédito</Button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty icon={<Undo2 size={28} />} title="Sin devoluciones abiertas" />}
      </Card>

      <Card title={<span className="row gap-2"><ShieldAlert size={16} className="t-warn" aria-hidden />Cuarentena · QUA-01</span>} actions={<a className="link" href="#/consola/cuarentena">Decidir en Cuarentena →</a>} pad={false}>
        <table className="tbl compact">
          <thead><tr><th>Producto</th><th>Lote</th><th className="r">Pzas</th><th>Origen</th></tr></thead>
          <tbody>
            {quarantine.map((b) => {
              const p = state.products.find((x) => x.sku === b.sku);
              const src = state.movements.filter((m) => m.to === "QUA-01" && m.sku === b.sku).at(-1);
              return (
                <tr key={b.sku + b.lot}>
                  <td>{p?.emoji} {p?.name}</td><td className="mono muted">{b.lot ?? "—"}</td><td className="r mono">{num(b.qty)}</td>
                  <td className="small">{src?.doc} · {src && dateTime(src.ts)} · {src?.note}</td>
                </tr>
              );
            })}
            {!quarantine.length && <tr><td colSpan={4} className="muted">Nada en cuarentena.</td></tr>}
          </tbody>
        </table>
      </Card>
      {creating && <NewRma onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewRma({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const shipped = state.orders.filter((o) => o.stage === "enviado").sort((a, b) => (b.shippedAt ?? 0) - (a.shippedAt ?? 0));
  const [orderId, setOrderId] = useState(shipped[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const o = state.orders.find((x) => x.id === orderId);
  const lines = o?.lines.map((l) => ({ sku: l.sku, max: returnable(state, o.id, l.sku) })) ?? [];
  const total = lines.reduce((n, l) => n + Math.min(l.max, qty[l.sku] ?? 0), 0);

  return (
    <Modal open onClose={onClose} title="Autorizar devolución (RMA)"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!total} onClick={() => {
          dispatch({ type: "CREATE_RMA", order: orderId, reason, user: user.id, lines: lines.map((l) => ({ sku: l.sku, qty: Math.min(l.max, qty[l.sku] ?? 0) })) });
          toast(`RMA autorizada: ${total} pzas de ${orderId}. El cliente recibe la etiqueta de retorno.`);
          onClose();
        }}>Autorizar {total ? `(${total} pzas)` : ""}</Button>
      </>}>
      <label className="field">Pedido enviado
        <select className="input" value={orderId} onChange={(e) => { setOrderId(e.target.value); setQty({}); }}>
          {shipped.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.customer}</option>)}
        </select>
      </label>
      <table className="tbl compact">
        <thead><tr><th>Producto</th><th className="r">Devolvible</th><th className="r">A devolver</th></tr></thead>
        <tbody>{lines.map((l) => {
          const p = state.products.find((x) => x.sku === l.sku);
          return (
            <tr key={l.sku}>
              <td>{p?.emoji} {p?.name}</td><td className="r mono">{l.max}</td>
              <td className="r"><input className="input sm num" type="number" min={0} max={l.max} disabled={!l.max} value={qty[l.sku] ?? 0}
                onChange={(e) => setQty({ ...qty, [l.sku]: Math.max(0, Math.min(l.max, Number(e.target.value))) })} aria-label={`Cantidad a devolver de ${l.sku}`} /></td>
            </tr>
          );
        })}</tbody>
      </table>
      <label className="field">Motivo
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      </label>
    </Modal>
  );
}
