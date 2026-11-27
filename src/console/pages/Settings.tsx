import { useMemo, useState } from "react";
import { Check, Minus } from "lucide-react";
import { suggestPutaway } from "../../core/engine";
import { useStore, can, whyNot, PERMISSIONS, PERMISSION_LABEL, ROLE_LABEL } from "../../core/store";
import type { RoleId, Rules as RulesT } from "../../core/types";
import { Avatar, Button, Card, useToast } from "../../ui/kit";
import { useConsole } from "../ctx";

export function Rules() {
  const { state, dispatch } = useStore();
  const { user } = useConsole();
  const toast = useToast();
  const [draft, setDraft] = useState<RulesT>(state.rules);
  const editable = can(user.role, "rules.edit");
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.rules);

  // Vista previa: cómo cambiaría la sugerencia de putaway con la regla en borrador
  const preview = useMemo(() => {
    const sim = { ...state, rules: draft };
    return ["CAF-500", "SHA-750", "LED-9W"].map((sku) => ({
      sku, now: suggestPutaway(state, sku, 24), next: suggestPutaway(sim, sku, 24),
    }));
  }, [state, draft]);

  const Opt = <K extends keyof RulesT>({ k, v, label, desc }: { k: K; v: RulesT[K]; label: string; desc: string }) => (
    <label className={`opt ${draft[k] === v ? "on" : ""} ${!editable ? "disabled" : ""}`}>
      <input type="radio" disabled={!editable} checked={draft[k] === v} onChange={() => setDraft({ ...draft, [k]: v })} />
      <span><strong>{label}</strong><small>{desc}</small></span>
    </label>
  );

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Motor de reglas</h1>
          <p className="muted">Putaway, remoción y conteo. Los cambios muestran una vista previa antes de aplicarse y quedan en la bitácora.</p>
        </div>
        <div className="row gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(state.rules)}>Descartar</Button>
          <Button variant="primary" disabled={!dirty} disabledReason={editable ? undefined : whyNot("rules.edit")}
            onClick={() => { dispatch({ type: "SET_RULES", rules: draft, user: user.id }); toast("Reglas aplicadas"); }}>Aplicar cambios</Button>
        </div>
      </div>
      <div className="grid-2">
        <Card title="Estrategia de remoción (picking)">
          <div className="opts">
            <Opt k="removal" v="FEFO" label="FEFO" desc="Primero en caducar, primero en salir. Recomendado para lote con caducidad." />
            <Opt k="removal" v="FIFO" label="FIFO" desc="Primero en entrar, primero en salir, por fecha de recepción." />
          </div>
        </Card>
        <Card title="Putaway dirigido">
          <div className="opts">
            <Opt k="putaway" v="misma_ubicacion" label="Consolidar con mismo SKU" desc="Busca un bin que ya tenga el producto y capacidad libre." />
            <Opt k="putaway" v="zona_preferida" label="Zona preferida" desc="Bin vacío en la zona asignada a la categoría del producto." />
            <Opt k="putaway" v="primera_libre" label="Primera libre" desc="Cualquier bin con capacidad, en orden de ruta." />
          </div>
        </Card>
        <Card title="Conteo y reabasto">
          <label className="check"><input type="checkbox" disabled={!editable} checked={draft.blindCount} onChange={(e) => setDraft({ ...draft, blindCount: e.target.checked })} /> Conteo a ciegas (el operario no ve la cantidad del sistema)</label>
          <label className="check"><input type="checkbox" disabled={!editable} checked={draft.blockExpired} onChange={(e) => setDraft({ ...draft, blockExpired: e.target.checked })} /> Bloquear lotes vencidos para surtido (cumplimiento FEFO)</label>
          <label className="check"><input type="checkbox" disabled={!editable} checked={draft.autoReplenish} onChange={(e) => setDraft({ ...draft, autoReplenish: e.target.checked })} /> Reabasto automático: generar tareas reserva → picking al surtir y al liberar oleadas</label>
        </Card>
        <Card title="Vista previa · sugerencia para 24 pzas">
          <table className="tbl compact">
            <thead><tr><th>SKU</th><th>Regla actual</th><th>Con cambios</th></tr></thead>
            <tbody>{preview.map((p) => (
              <tr key={p.sku}><td className="mono">{p.sku}</td><td className="mono">{p.now}</td><td className={`mono ${p.now !== p.next ? "t-brand" : "muted"}`}>{p.next}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

export function UsersRoles() {
  const { state } = useStore();
  const { user } = useConsole();
  const roles = Object.keys(ROLE_LABEL) as RoleId[];
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Usuarios y roles</h1>
          <p className="muted">Permisos por rol a nivel de operación. Lo que un rol no puede hacer aparece deshabilitado con la razón. Cambia de rol desde el menú de usuario.</p>
        </div>
      </div>
      <div className="grid-2">
        <Card pad={false} title="Usuarios">
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Turno</th><th>Dispositivo</th></tr></thead>
            <tbody>{state.users.map((u) => (
              <tr key={u.id} className={u.id === user.id ? "selected" : ""}>
                <td><span className="row gap-2"><Avatar initials={u.initials} />{u.name}{u.id === user.id && <span className="muted small">(tú)</span>}</span></td>
                <td>{ROLE_LABEL[u.role]}</td><td className="muted">{u.shift}</td>
                <td className="muted">{u.role === "operario" ? "Handheld" : u.role === "empacador" ? "Estación de empaque" : "Escritorio"}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card pad={false} title="Matriz de permisos">
          <table className="tbl compact matrix">
            <thead><tr><th>Permiso</th>{roles.map((r) => <th key={r} className="c" title={ROLE_LABEL[r]}>{ROLE_LABEL[r].split(" ")[0]}</th>)}</tr></thead>
            <tbody>{PERMISSIONS.map((p) => (
              <tr key={p}><td>{PERMISSION_LABEL[p]}</td>{roles.map((r) => <td key={r} className="c">{can(r, p) ? <Check size={15} className="t-done" /> : <Minus size={15} className="muted" />}</td>)}</tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
