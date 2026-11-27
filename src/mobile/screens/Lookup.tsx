import { useState } from "react";
import { balancesAt, balancesOf, lookup, type LookupHit } from "../../core/engine";
import { useStore } from "../../core/store";
import { ScanField, TaskScreen, useFeedback } from "../parts";
import { STAGE } from "../../ui/format";

// Consulta rápida: escanear cualquier código y ver qué es, dónde está y cuánto hay.
export function Lookup() {
  const { state, bal } = useStore();
  const fb = useFeedback();
  const [hit, setHit] = useState<LookupHit | null>(null);
  const [code, setCode] = useState("");

  const onScan = (c: string) => {
    const h = lookup(state, c)[0];
    setCode(c);
    if (!h) { setHit(null); return fb(false, "Código no encontrado"); }
    fb(true, c);
    setHit(h);
  };

  return (
    <TaskScreen title="Consultar" context="Escanea cualquier código">
      <ScanField placeholder="Producto, ubicación, lote o pedido" onScan={onScan}
        simulate={[{ label: "Café (EAN)", code: state.products[0].barcode }, { label: "A-01-01-1", code: "A-01-01-1" }, { label: "Lote", code: state.lots[0]?.code ?? "" }, { label: "PED-5008", code: "PED-5008" }]} />
      {!hit && code && <div className="hh-empty">Sin resultados para {code}</div>}
      {hit?.kind === "producto" && (() => {
        const p = hit.product;
        const rows = balancesOf(bal, p.sku);
        return <>
          <div className="hh-product xl"><span className="hh-photo">{p.emoji}</span><div><strong>{p.name}</strong><span className="mono">{p.sku} · {p.barcode}</span><span>Total {rows.reduce((s, b) => s + b.qty, 0)} pzas</span></div></div>
          <div className="hh-list">{rows.map((b) => <div key={b.loc + b.lot} className="hh-row static"><span><strong className="mono">{b.loc}</strong><small>{b.lot ?? "sin lote"}{b.reserved ? ` · ${b.reserved} reservadas` : ""}</small></span><em>{b.qty}</em></div>)}</div>
        </>;
      })()}
      {hit?.kind === "ubicacion" && (
        <>
          <div className="hh-instr big"><span>Ubicación {hit.location.type}{hit.location.blocked && " · BLOQUEADA"}</span><strong className="mono">{hit.location.code}</strong></div>
          <div className="hh-list">
            {balancesAt(bal, hit.location.code).map((b) => {
              const p = state.products.find((x) => x.sku === b.sku)!;
              return <div key={b.sku + b.lot} className="hh-row static"><span className="hh-emoji">{p.emoji}</span><span><strong>{p.name}</strong><small>{b.lot ?? p.sku}</small></span><em>{b.qty}</em></div>;
            })}
            {!balancesAt(bal, hit.location.code).length && <div className="hh-empty">Vacía</div>}
          </div>
        </>
      )}
      {hit?.kind === "lote" && (
        <>
          <div className="hh-instr"><span>Lote de {state.products.find((p) => p.sku === hit.lot.sku)?.name}</span><strong className="mono">{hit.lot.code}</strong><small>Caducidad {hit.lot.expiryDate ?? "n/a"} · origen {hit.lot.origin}</small></div>
          <div className="hh-list">{[...bal.values()].filter((b) => b.lot === hit.lot.code && b.qty > 0).map((b) => <div key={b.loc} className="hh-row static"><span><strong className="mono">{b.loc}</strong></span><em>{b.qty}</em></div>)}</div>
        </>
      )}
      {hit?.kind === "pedido" && (
        <>
          <div className="hh-instr"><span>{hit.order.customer} · {hit.order.carrier}</span><strong className="mono">{hit.order.id}</strong><small>{STAGE[hit.order.stage].label}</small></div>
          <div className="hh-list">{hit.order.lines.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku)!;
            return <div key={l.sku} className="hh-row static"><span className="hh-emoji">{p.emoji}</span><span><strong>{p.name}</strong><small>surtidas {l.picked}</small></span><em>{l.qty}</em></div>;
          })}</div>
        </>
      )}
      {(hit?.kind === "recepcion" || hit?.kind === "tarea") && <div className="hh-instr"><span>{hit.kind}</span><strong className="mono">{hit.kind === "recepcion" ? hit.id : hit.task.id}</strong></div>}
    </TaskScreen>
  );
}
