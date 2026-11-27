import { useState } from "react";
import { useStore, can, whyNot } from "../../core/store";
import { pickTaskLabel } from "../../core/engine";
import type { DocStatus, Task, TaskType } from "../../core/types";
import { Avatar, Pill, Tabs, useToast } from "../../ui/kit";
import { ago, STATUS, TASK_LABEL } from "../../ui/format";
import { useConsole } from "../ctx";

export function Tasks() {
  const { state, dispatch } = useStore();
  const { inspect, user } = useConsole();
  const toast = useToast();
  const [type, setType] = useState<"todas" | TaskType>("todas");
  const canAssign = can(user.role, "task.assign");
  const ops = state.users.filter((u) => u.role === "operario");
  const since = Date.now() - 12 * 3_600_000;
  const tasks = state.tasks.filter((t) => (type === "todas" || t.type === type) && (t.status !== "completo" || (t.doneAt ?? 0) > since));
  const cols: DocStatus[] = ["pendiente", "en_proceso", "completo"];

  const describe = (t: Task) => {
    const p = state.products.find((x) => x.sku === t.sku);
    if (t.type === "ubicar") return `${p?.emoji ?? ""} ${t.qty} × ${t.sku} → ${t.suggested ?? "?"}`;
    if (t.type === "surtir") {
      const done = t.steps!.filter((s) => s.status !== "pendiente").length;
      return `${done}/${t.steps!.length} líneas · ${pickTaskLabel(t)}`;
    }
    if (t.type === "reabastecer") return `${p?.emoji ?? ""} ${t.qty} × ${t.sku} · ${t.from} → ${t.suggested}`;
    if (t.type === "retirar") return `${p?.emoji ?? ""} ${t.qty} × ${t.lot} · ${t.from} → QUA-01 (${t.doc})`;
    return `${t.locations?.length} ubicaciones · ${t.doc}`;
  };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Tareas</h1>
          <p className="muted">Cola de trabajo dirigida por el sistema. El handheld muestra a cada operario su siguiente tarea por prioridad.</p>
        </div>
        <Tabs value={type} onChange={setType} items={[
          { id: "todas", label: "Todas" }, { id: "surtir", label: "Surtir" }, { id: "ubicar", label: "Ubicar" }, { id: "contar", label: "Contar" }, { id: "retirar", label: "Retirar" }, { id: "reabastecer", label: "Reabastecer" },
        ]} />
      </div>
      <div className="board">
        {cols.map((c) => {
          const list = tasks.filter((t) => t.status === c).sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
          return (
            <section key={c} className="board-col">
              <header><Pill tone={STATUS[c].tone}>{c === "completo" ? "Completadas (12 h)" : STATUS[c].label}</Pill><span className="muted">{list.length}</span></header>
              {list.map((t) => (
                <article key={t.id} className="task-card" onClick={() => inspect({ kind: "tarea", id: t.id })}>
                  <div className="row between">
                    <span className="row gap-2"><span className={`type-tag type-${t.type}`}>{TASK_LABEL[t.type]}</span><span className="mono small">{t.id}</span></span>
                    <span className={`prio p${t.priority}`}>P{t.priority}</span>
                  </div>
                  <div className="task-desc">{describe(t)}</div>
                  {t.type === "surtir" && t.steps && (
                    <div className="mini-steps">{t.steps.map((s, i) => <i key={i} className={s.status} />)}</div>
                  )}
                  <div className="row between" onClick={(e) => e.stopPropagation()}>
                    {c !== "completo" ? (
                      <select className="input sm" aria-label={`Asignar ${t.id}`} value={t.assignee ?? ""} disabled={!canAssign} title={canAssign ? "Reasignar" : whyNot("task.assign")}
                        onChange={(e) => { dispatch({ type: "ASSIGN_TASK", task: t.id, assignee: e.target.value, user: user.id }); toast(`${t.id} reasignada`); }}>
                        <option value="" disabled>Sin asignar</option>
                        {ops.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    ) : (
                      <span className="row gap-2 small">{t.assignee && <Avatar initials={state.users.find((u) => u.id === t.assignee)!.initials} size={20} />}{state.users.find((u) => u.id === t.assignee)?.name}</span>
                    )}
                    <span className="muted small">{ago(t.doneAt ?? t.startedAt ?? t.createdAt)}</span>
                  </div>
                </article>
              ))}
              {!list.length && <div className="muted small board-empty">Sin tareas</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
