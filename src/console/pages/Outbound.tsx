import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Truck } from "lucide-react";
import { useStore, can, whyNot } from "../../core/store";
import type { Order, OrderStage } from "../../core/types";
import { Button, Card, Code, Empty, Pill, Tabs, useToast } from "../../ui/kit";
import { ago, STAGE } from "../../ui/format";
import { useConsole } from "../ctx";

type TabId = "todas" | OrderStage | "excepciones";

export function Outbound() {
  const { state, dispatch } = useStore();
  const { inspect, user } = useConsole();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("etapa") as TabId) ?? "todas";
  const [carrier, setCarrier] = useState<string>("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const stages: OrderStage[] = ["nuevo", "liberado", "en_picking", "surtido", "empacado", "enviado"];
  const match = (o: Order, t: TabId) => t === "todas" || (t === "excepciones" ? !!o.exception && o.stage !== "enviado" : o.stage === t);
  const rows = useMemo(() => state.orders
    .filter((o) => match(o, tab))
    .filter((o) => !carrier || o.carrier === carrier)
    .filter((o) => !q || (o.id + o.customer).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.due - b.due), [state.orders, tab, carrier, q]);

  const shippable = rows.filter((o) => sel.has(o.id) && o.stage === "empacado");
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Salidas</h1>
          <p className="muted">Pedidos desde su creación hasta el envío. Haz clic en una fila para ver líneas, movimientos y guía.</p>
        </div>
      </div>
      <Card pad={false} title={
        <Tabs value={tab} onChange={(v) => { setParams(v === "todas" ? {} : { etapa: v }); setSel(new Set()); }} items={[
          { id: "todas" as TabId, label: "Todas", count: state.orders.length },
          ...stages.map((s) => ({ id: s as TabId, label: STAGE[s].label, count: state.orders.filter((o) => o.stage === s).length })),
          { id: "excepciones" as TabId, label: "Excepciones", count: state.orders.filter((o) => match(o, "excepciones")).length },
        ]} />
      }>
        <div className="toolbar">
          <input className="input" aria-label="Filtrar por pedido o cliente" placeholder="Filtrar por pedido o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} aria-label="Transportista">
            <option value="">Todos los transportistas</option>
            {["Estafeta", "DHL", "FedEx", "99 Minutos"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="grow" />
          {sel.size > 0 && <span className="muted small">{sel.size} seleccionados</span>}
          <Button variant="primary" icon={<Truck size={15} />} disabled={!shippable.length}
            disabledReason={!can(user.role, "ship.confirm") ? whyNot("ship.confirm") : undefined}
            onClick={() => {
              dispatch({ type: "SHIP_ORDERS", orders: shippable.map((o) => o.id), user: user.id });
              toast(`${shippable.length} pedido(s) cargados y enviados. Rastreo enviado al ERP.`);
              setSel(new Set());
            }}>
            Confirmar carga{shippable.length ? ` (${shippable.length})` : ""}
          </Button>
        </div>
        {rows.length ? (
          <table className="tbl">
            <thead><tr><th style={{ width: 32 }}></th><th>Pedido</th><th>Cliente</th><th>Canal</th><th>Transportista</th><th className="r">Líneas</th><th>Compromiso</th><th>Etapa</th></tr></thead>
            <tbody>
              {rows.map((o) => {
                const late = o.due < Date.now() && o.stage !== "enviado";
                return (
                  <tr key={o.id} className={`clickable ${sel.has(o.id) ? "selected" : ""}`} onClick={() => inspect({ kind: "pedido", id: o.id })}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Seleccionar ${o.id}`} />
                    </td>
                    <td><Code>{o.id}</Code>{o.priority === "alta" && <Pill tone="warn" dot={false}>Alta</Pill>}</td>
                    <td><strong>{o.customer}</strong>{o.exception && <div className="t-blocked small">{o.exception}</div>}</td>
                    <td className="muted">{o.channel}</td>
                    <td>{o.carrier}</td>
                    <td className="r mono">{o.lines.length}</td>
                    <td className={late ? "t-blocked" : "muted"}>{ago(o.due)}{late && " · atrasado"}</td>
                    <td><Pill tone={o.exception && o.stage !== "enviado" ? "blocked" : STAGE[o.stage].tone}>{STAGE[o.stage].label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty icon={<Truck size={28} />} title="Sin pedidos en esta vista" />}
      </Card>
    </div>
  );
}
