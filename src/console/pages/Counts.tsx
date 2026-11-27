import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useStore, can, whyNot } from "../../core/store";
import { Button, Card, Code, Empty, Modal, Pill, useToast } from "../../ui/kit";
import { ago, STATUS } from "../../ui/format";
import { useConsole } from "../ctx";

export function Counts() {
  const { state, dispatch } = useStore();
  const { inspect, user } = useConsole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [abc, setAbc] = useState<"A" | "B" | "C">("A");

  const abcLocations = () => {
    const skus = new Set(state.products.filter((p) => p.abc === abc).map((p) => p.sku));
    return [...new Set(state.movements.filter((m) => skus.has(m.sku) && /^[ABC]-/.test(m.to)).map((m) => m.to))].slice(0, 6);
  };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Conteos cíclicos</h1>
          <p className="muted">Se cuenta sin congelar la operación. Conteo {state.rules.blindCount ? "a ciegas" : "informado"}; las diferencias requieren aprobación antes de ajustar.</p>
        </div>
        <Button variant="primary" disabledReason={can(user.role, "count.create") ? undefined : whyNot("count.create")} onClick={() => setOpen(true)}>
          Generar conteo ABC
        </Button>
      </div>

      {state.counts.length ? state.counts.map((c) => {
        const diffs = c.lines.filter((l) => l.counted !== undefined && l.counted !== l.expected);
        const tone = c.status === "por_aprobar" ? "warn" : STATUS[c.status].tone;
        return (
          <Card key={c.id} title={<span className="row gap-3"><Code>{c.id}</Code><Pill tone={tone}>{STATUS[c.status].label}</Pill><span className="muted small">{c.reason} · {ago(c.createdAt)}</span></span>}
            actions={c.status === "por_aprobar" && (
              <Button variant="primary" size="sm" disabledReason={can(user.role, "count.approve") ? undefined : whyNot("count.approve")}
                onClick={() => { dispatch({ type: "APPROVE_COUNT", count: c.id, user: user.id }); toast(`Ajuste aprobado: ${diffs.length} movimiento(s) de ajuste registrados`); }}>
                Aprobar ajuste
              </Button>
            )} pad={false}>
            <table className="tbl compact">
              <thead><tr><th>Ubicación</th><th>Producto</th><th>Lote</th><th className="r">Sistema</th><th className="r">Contado</th><th className="r">Diferencia</th></tr></thead>
              <tbody>{c.lines.map((l, i) => {
                const d = l.counted === undefined ? undefined : l.counted - l.expected;
                const p = state.products.find((x) => x.sku === l.sku);
                return (
                  <tr key={i}>
                    <td><Code onClick={() => inspect({ kind: "ubicacion", id: l.location })}>{l.location}</Code></td>
                    <td>{p ? `${p.emoji} ${p.name}` : <span className="muted">Vacía</span>}</td>
                    <td className="mono muted">{l.lot ?? "—"}</td>
                    <td className="r mono">{l.expected}</td>
                    <td className="r mono">{l.counted ?? <span className="muted">por contar</span>}</td>
                    <td className={`r mono ${d ? "t-blocked" : "muted"}`}>{d === undefined ? "—" : d > 0 ? `+${d}` : d || "0"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Card>
        );
      }) : <Empty icon={<ClipboardCheck size={28} />} title="Sin conteos" />}

      <Modal open={open} onClose={() => setOpen(false)} title="Generar conteo cíclico"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => {
            const locs = abcLocations();
            dispatch({ type: "CREATE_COUNT", locations: locs, reason: `Cíclico ABC (clase ${abc})`, user: user.id });
            toast(`Conteo de ${locs.length} ubicaciones enviado al handheld`);
            setOpen(false);
          }}>Generar y enviar</Button>
        </>}>
        <p className="muted">Selecciona la clase ABC. Las ubicaciones con productos de esa clase se envían como tarea al handheld.</p>
        <div className="seg">
          {(["A", "B", "C"] as const).map((x) => <button key={x} className={abc === x ? "on" : ""} onClick={() => setAbc(x)}>Clase {x}</button>)}
        </div>
        <div className="chips">{abcLocations().map((l) => <span key={l} className="chip mono">{l}</span>)}</div>
      </Modal>
    </div>
  );
}
