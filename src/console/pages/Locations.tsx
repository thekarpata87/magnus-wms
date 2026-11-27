import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { balancesAt, locQty } from "../../core/engine";
import { useStore, can, whyNot } from "../../core/store";
import { Button, Card, Tabs, useToast } from "../../ui/kit";
import { num } from "../../ui/format";
import { useConsole } from "../ctx";

type Mode = "ocupacion" | "abc" | "caducidad";

export function Locations() {
  const { state, bal, dispatch } = useStore();
  const { inspect, user } = useConsole();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("ocupacion");
  const [selected, setSelected] = useState<string | null>(null);
  const zones = ["A", "B", "C"];
  const special = state.locations.filter((l) => !["A", "B", "C"].includes(l.zone));
  const soon = Date.now() + 30 * 86_400_000;

  const cellStyle = (code: string) => {
    const l = state.locations.find((x) => x.code === code)!;
    const here = balancesAt(bal, code);
    if (l.blocked) return { cls: "cell-blocked", label: "Bloq." };
    if (!here.length) return { cls: "cell-empty", label: "" };
    if (mode === "ocupacion") {
      const r = locQty(bal, code) / l.capacity;
      return { cls: `cell-occ-${r > 0.85 ? 4 : r > 0.6 ? 3 : r > 0.3 ? 2 : 1}`, label: `${Math.round(r * 100)}%` };
    }
    if (mode === "abc") {
      const abc = state.products.find((p) => p.sku === here[0].sku)?.abc ?? "C";
      return { cls: `cell-abc-${abc}`, label: abc };
    }
    const exp = here.some((b) => {
      const e = state.lots.find((x) => x.code === b.lot)?.expiryDate;
      return e && new Date(e).getTime() < soon;
    });
    return { cls: exp ? "cell-exp" : "cell-occ-1", label: exp ? "≤30d" : "" };
  };

  const sel = state.locations.find((l) => l.code === selected);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Ubicaciones</h1>
          <p className="muted">Jerarquía zona › pasillo › rack › nivel. Nivel 1 = picking, niveles 2–3 = reserva. Haz clic en un bin para ver su contenido.</p>
        </div>
        <Tabs value={mode} onChange={setMode} items={[{ id: "ocupacion", label: "Ocupación" }, { id: "abc", label: "Rotación ABC" }, { id: "caducidad", label: "Caducidad" }]} />
      </div>

      <div className="grid-2-1">
        <Card title="Mapa del almacén" actions={<Legend mode={mode} />}>
          <div className="map">
            {zones.map((z) => (
              <div key={z} className="zone">
                <div className="zone-h">Zona {z} <span className="muted small">{z === "A" ? "Abarrotes y bebidas" : z === "B" ? "Higiene y papelería" : "Ferretería y electrónica"}</span></div>
                {["01", "02"].map((a) => (
                  <div key={a} className="aisle">
                    <div className="aisle-label">P{a}</div>
                    <div className="racks">
                      {["01", "02", "03", "04"].map((r) => (
                        <div key={r} className="rack">
                          {["3", "2", "1"].map((lv) => {
                            const code = `${z}-${a}-${r}-${lv}`;
                            const c = cellStyle(code);
                            return (
                              <button key={lv} className={`cell ${c.cls} ${selected === code ? "sel" : ""}`} title={`${code} · ${num(locQty(bal, code))} pzas`}
                                onClick={() => setSelected(code)} aria-pressed={selected === code}
                                aria-label={`${code}, ${c.cls === "cell-empty" ? "vacía" : c.cls === "cell-blocked" ? "bloqueada" : mode === "ocupacion" ? `ocupación ${c.label}` : mode === "abc" ? `clase ${c.label}` : c.label ? "con lote por caducar" : "con stock"}`}>
                                <span>{c.label}</span>
                              </button>
                            );
                          })}
                          <small>R{r}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="special">
            {special.map((l) => (
              <button key={l.code} className="chip" onClick={() => setSelected(l.code)}>
                <span className="mono">{l.code}</span> <span className="muted">· {l.type} · {num(locQty(bal, l.code))}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={sel ? <span className="mono">{sel.code}</span> : "Selecciona una ubicación"} className="sticky">
          {sel ? (
            <>
              <div className="muted small">{sel.type} · capacidad {num(sel.capacity)} · ocupado {num(locQty(bal, sel.code))}</div>
              <ul className="plain">
                {balancesAt(bal, sel.code).map((b) => {
                  const p = state.products.find((x) => x.sku === b.sku);
                  return <li key={b.sku + b.lot} className="row between"><span>{p?.emoji} {p?.name}<div className="mono muted small">{b.lot ?? "sin lote"}</div></span><strong className="mono">{num(b.qty)}</strong></li>;
                })}
                {!balancesAt(bal, sel.code).length && <li className="muted">Vacía</li>}
              </ul>
              <div className="row gap-2 wrap">
                <Button size="sm" onClick={() => inspect({ kind: "ubicacion", id: sel.code })}>Ver movimientos</Button>
                <Button size="sm" icon={sel.blocked ? <Unlock size={14} /> : <Lock size={14} />}
                  disabledReason={can(user.role, "location.block") ? undefined : whyNot("location.block")}
                  onClick={() => { dispatch({ type: "TOGGLE_BLOCK_LOCATION", code: sel.code, user: user.id }); toast(`${sel.code} ${sel.blocked ? "desbloqueada" : "bloqueada"}`); }}>
                  {sel.blocked ? "Desbloquear" : "Bloquear"}
                </Button>
                <Button size="sm" disabledReason={can(user.role, "count.create") ? undefined : whyNot("count.create")}
                  onClick={() => { dispatch({ type: "CREATE_COUNT", locations: [sel.code], reason: "Solicitado desde mapa", user: user.id }); toast(`Conteo de ${sel.code} enviado al handheld`); }}>
                  Pedir conteo
                </Button>
              </div>
            </>
          ) : <p className="muted">El mapa muestra cada bin con color según la vista elegida. Bloquear una ubicación la excluye de putaway y picking.</p>}
        </Card>
      </div>
    </div>
  );
}

function Legend({ mode }: { mode: Mode }) {
  const items = mode === "ocupacion"
    ? [["cell-empty", "Vacía"], ["cell-occ-1", "< 30%"], ["cell-occ-2", "30–60%"], ["cell-occ-3", "60–85%"], ["cell-occ-4", "> 85%"], ["cell-blocked", "Bloqueada"]]
    : mode === "abc" ? [["cell-abc-A", "A"], ["cell-abc-B", "B"], ["cell-abc-C", "C"], ["cell-empty", "Vacía"]]
    : [["cell-exp", "Caduca ≤ 30 d"], ["cell-occ-1", "Con stock"], ["cell-empty", "Vacía"]];
  return <div className="legend">{items.map(([c, l]) => <span key={c}><i className={`cell ${c}`} />{l}</span>)}</div>;
}
