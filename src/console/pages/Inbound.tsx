import { useState } from "react";
import { PackageOpen } from "lucide-react";
import { useStore, can, whyNot } from "../../core/store";
import { Button, Card, Code, Empty, Pill, Progress, Tabs, useToast } from "../../ui/kit";
import { ago, dateTime, STATUS } from "../../ui/format";
import { useConsole } from "../ctx";

export function Inbound() {
  const { state, dispatch } = useStore();
  const { inspect, user } = useConsole();
  const toast = useToast();
  const [tab, setTab] = useState<"abiertas" | "todas">("abiertas");
  const rows = [...state.receipts]
    .filter((r) => tab === "todas" || r.status !== "completo")
    .sort((a, b) => a.appointment - b.appointment);
  const putaways = state.tasks.filter((t) => t.type === "ubicar" && t.status !== "completo");

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Entradas</h1>
          <p className="muted">Órdenes de compra y avisos de embarque (ASN). La recepción se ejecuta en el handheld escaneando contra lo esperado.</p>
        </div>
      </div>
      <Card pad={false} title={<Tabs value={tab} onChange={setTab} items={[
        { id: "abiertas", label: "Abiertas", count: state.receipts.filter((r) => r.status !== "completo").length },
        { id: "todas", label: "Todas", count: state.receipts.length },
      ]} />}>
        {rows.length ? (
          <table className="tbl">
            <thead><tr><th>OC</th><th>Proveedor</th><th>ASN</th><th>Andén / cita</th><th>Avance</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const exp = r.lines.reduce((s, l) => s + l.expected, 0);
                const rec = r.lines.reduce((s, l) => s + l.received, 0);
                return (
                  <tr key={r.id} className="clickable" onClick={() => inspect({ kind: "recepcion", id: r.id })}>
                    <td><Code>{r.id}</Code></td>
                    <td><strong>{r.supplier}</strong><div className="muted small">{r.lines.length} líneas</div></td>
                    <td className="mono muted">{r.asn ?? "—"}</td>
                    <td><span className="mono">{r.dock}</span><div className="muted small">{dateTime(r.appointment)} · {ago(r.appointment)}</div></td>
                    <td style={{ minWidth: 140 }}><Progress value={rec / exp} tone={rec >= exp ? "done" : "progress"} /><div className="muted small">{rec} / {exp} pzas</div></td>
                    <td><Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill></td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      {r.status === "en_proceso" && (
                        <Button size="sm" variant="primary" disabledReason={can(user.role, "receipt.close") ? undefined : whyNot("receipt.close")}
                          onClick={() => { dispatch({ type: "CLOSE_RECEIPT", receipt: r.id, user: user.id }); toast(`${r.id} cerrada`); }}>
                          Cerrar recepción
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty icon={<PackageOpen size={28} />} title="Sin recepciones abiertas">Las nuevas OC aparecerán aquí con su cita de andén.</Empty>}
      </Card>

      <Card title={`Pendientes de ubicar (${putaways.length})`} pad={false}>
        {putaways.length ? (
          <table className="tbl">
            <thead><tr><th>Tarea</th><th>Producto</th><th>Lote</th><th className="r">Cant.</th><th>Desde</th><th>Ubicación sugerida</th><th>Antigüedad</th></tr></thead>
            <tbody>{putaways.map((t) => {
              const p = state.products.find((x) => x.sku === t.sku);
              return (
                <tr key={t.id} className="clickable" onClick={() => inspect({ kind: "tarea", id: t.id })}>
                  <td><Code>{t.id}</Code></td>
                  <td>{p?.emoji} {p?.name}</td>
                  <td className="mono muted">{t.lot ?? "—"}</td>
                  <td className="r mono">{t.qty}</td>
                  <td className="mono">{t.from}</td>
                  <td><span className="code">{t.suggested ?? "Sin espacio"}</span> <span className="muted small">regla: {state.rules.putaway.replace("_", " ")}</span></td>
                  <td className="muted">{ago(t.createdAt)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty title="Todo lo recibido está ubicado" />}
      </Card>
    </div>
  );
}
