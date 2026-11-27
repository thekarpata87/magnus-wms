import { useMemo, useState } from "react";
import { Download, GitBranch } from "lucide-react";
import { useStore } from "../../core/store";
import type { MovementType } from "../../core/types";
import { Button, Card, Code, Empty } from "../../ui/kit";
import { dateTime, MOVE_LABEL, num } from "../../ui/format";
import { useConsole } from "../ctx";
import { Expiry } from "../Inspector";

function exportCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export function Movements() {
  const { state } = useStore();
  const { inspect } = useConsole();
  const [type, setType] = useState<"" | MovementType>("");
  const [q, setQ] = useState("");
  const [userF, setUserF] = useState("");
  const rows = useMemo(() => [...state.movements].reverse().filter((m) =>
    (!type || m.type === type) && (!userF || m.user === userF) &&
    (!q || [m.sku, m.lot, m.from, m.to, m.doc].join(" ").toLowerCase().includes(q.toLowerCase()))), [state.movements, type, q, userF]);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Movimientos (kardex)</h1>
          <p className="muted">Registro inmutable: cada escaneo confirmado crea un movimiento con origen, destino, usuario y dispositivo.</p>
        </div>
        <Button icon={<Download size={15} />} onClick={() => exportCsv("kardex.csv", [["Fecha", "Tipo", "SKU", "Lote", "Origen", "Destino", "Cantidad", "Usuario", "Dispositivo", "Documento"],
          ...rows.map((m) => [new Date(m.ts).toISOString(), MOVE_LABEL[m.type], m.sku, m.lot ?? "", m.from, m.to, m.qty, name(m.user), m.device, m.doc ?? ""])])}>Exportar CSV</Button>
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <input className="input" aria-label="Filtrar movimientos por SKU, lote, ubicación o documento" placeholder="SKU, lote, ubicación o documento" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={type} onChange={(e) => setType(e.target.value as MovementType)} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {Object.entries(MOVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" value={userF} onChange={(e) => setUserF(e.target.value)} aria-label="Usuario">
            <option value="">Todos los usuarios</option>
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <div className="grow" /><span className="muted small">{num(rows.length)} movimientos</span>
        </div>
        <table className="tbl compact">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>SKU</th><th>Lote</th><th>Origen → destino</th><th className="r">Cant.</th><th>Usuario</th><th>Dispositivo</th><th>Documento</th></tr></thead>
          <tbody>{rows.slice(0, 200).map((m) => (
            <tr key={m.id}>
              <td className="muted nowrap">{dateTime(m.ts)}</td>
              <td><span className={`mv mv-${m.type}`}>{MOVE_LABEL[m.type]}</span></td>
              <td><Code onClick={() => inspect({ kind: "producto", id: m.sku })}>{m.sku}</Code></td>
              <td>{m.lot ? <Code onClick={() => inspect({ kind: "lote", id: m.lot! })}>{m.lot}</Code> : <span className="muted">—</span>}</td>
              <td className="mono nowrap">{m.from} <span className="muted">→</span> {m.to}</td>
              <td className="r mono">{num(m.qty)}</td>
              <td><button className="link" onClick={() => inspect({ kind: "usuario", id: m.user })}>{name(m.user)}</button></td>
              <td className="muted">{m.device}</td>
              <td className="mono small">{m.doc}{m.note && <div className="muted">{m.note}</div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

export function Traceability() {
  const { state, bal } = useStore();
  const { inspect } = useConsole();
  const [q, setQ] = useState("LCAF2610");
  const lot = state.lots.find((l) => l.code.toLowerCase() === q.trim().toLowerCase());
  const p = lot && state.products.find((x) => x.sku === lot.sku);
  const moves = lot ? state.movements.filter((m) => m.lot === lot.code) : [];
  const orders = [...new Set(moves.filter((m) => m.type === "surtido" && m.doc).map((m) => m.doc!))].map((id) => state.orders.find((o) => o.id === id)!).filter(Boolean);
  const where = lot ? [...bal.values()].filter((b) => b.lot === lot.code && b.qty > 0) : [];
  const recalled = orders.reduce((s, o) => s + moves.filter((m) => m.doc === o.id && m.type === "surtido").reduce((a, m) => a + m.qty, 0), 0);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Trazabilidad de lote</h1>
          <p className="muted">Hacia atrás (proveedor y recepción) y hacia adelante (pedidos y clientes). Base para un recall.</p>
        </div>
      </div>
      <Card>
        <div className="toolbar flush">
          <input className="input lg" list="lots" aria-label="Lote a rastrear" placeholder="Escanea o escribe un lote" value={q} onChange={(e) => setQ(e.target.value)} />
          <datalist id="lots">{state.lots.map((l) => <option key={l.code} value={l.code}>{l.sku}</option>)}</datalist>
        </div>
        {!lot ? <Empty icon={<GitBranch size={28} />} title="Escribe un lote existente">Ejemplos: LCAF2610, LAGU2702, LJUG2614</Empty> : (
          <div className="trace">
            <div className="trace-col">
              <h4>Origen</h4>
              <div className="trace-node">
                <strong>{lot.origin}</strong>
                <span className="muted small">{lot.origin.startsWith("OC") ? state.receipts.find((r) => r.id === lot.origin)?.supplier : "Inventario inicial"}</span>
                {lot.origin.startsWith("OC") && <button className="link small" onClick={() => inspect({ kind: "recepcion", id: lot.origin })}>Ver recepción</button>}
              </div>
            </div>
            <div className="trace-arrow" />
            <div className="trace-col">
              <h4>Lote</h4>
              <div className="trace-node focus">
                <strong className="mono">{lot.code}</strong>
                <span>{p?.emoji} {p?.name}</span>
                <span className="small">Caducidad: <Expiry iso={lot.expiryDate} /></span>
              </div>
            </div>
            <div className="trace-arrow" />
            <div className="trace-col">
              <h4>En almacén ({num(where.reduce((s, b) => s + b.qty, 0))})</h4>
              {where.map((b) => <button key={b.loc} className="trace-node sm" onClick={() => inspect({ kind: "ubicacion", id: b.loc })}><span className="mono">{b.loc}</span><strong>{num(b.qty)}</strong></button>)}
              {!where.length && <span className="muted small">Sin existencia</span>}
            </div>
            <div className="trace-arrow" />
            <div className="trace-col">
              <h4>Clientes ({orders.length} pedidos · {num(recalled)} pzas)</h4>
              {orders.map((o) => <button key={o.id} className="trace-node sm" onClick={() => inspect({ kind: "pedido", id: o.id })}><span className="mono">{o.id}</span><span className="small muted">{o.customer}</span></button>)}
              {!orders.length && <span className="muted small">Aún no sale a clientes</span>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Audit() {
  const { state } = useStore();
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Bitácora de auditoría</h1>
          <p className="muted">Acciones de usuarios sobre documentos, reglas y configuración. No se puede editar ni borrar.</p>
        </div>
      </div>
      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Objeto</th><th>Detalle</th></tr></thead>
          <tbody>{state.audit.map((a) => (
            <tr key={a.id}>
              <td className="muted nowrap">{dateTime(a.ts)}</td>
              <td>{name(a.user)}</td>
              <td><strong>{a.action}</strong></td>
              <td className="mono">{a.target}</td>
              <td className="muted">{a.detail}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
