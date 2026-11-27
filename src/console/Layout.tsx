import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, PackageOpen, Truck, Waves, ListChecks, Boxes, Tag, Map, ClipboardCheck, History,
  GitBranch, BarChart3, DoorOpen, Undo2, ShieldCheck, ShieldAlert, RefreshCw, ScrollText, SlidersHorizontal, Users, Search, ChevronDown, Smartphone, RotateCcw,
  Warehouse, PanelLeftClose, PanelLeft, WifiOff,
} from "lucide-react";
import { useStore, useSessionUser, ROLE_LABEL, can, whyNot } from "../core/store";
import { alerts, lookup, quarantineItems, replenishPlan, type LookupHit } from "../core/engine";
import { Avatar, Kbd, useDialog, useToast } from "../ui/kit";
import { ConsoleCtx, type InspectTarget } from "./ctx";
import { Inspector } from "./Inspector";

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; badge?: number; badgeTone?: string }

export function ConsoleLayout() {
  const { state, dispatch } = useStore();
  const [userId, setUserId] = useSessionUser("console", "u5");
  const user = state.users.find((u) => u.id === userId) ?? state.users[4];
  const [target, setTarget] = useState<InspectTarget | null>(null);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const loc = useLocation();
  const al = useMemo(() => alerts(state), [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setTarget(null), [loc.pathname]);

  const openTasks = state.tasks.filter((t) => t.status !== "completo").length;
  const qItems = useMemo(() => quarantineItems(state).length, [state]);
  const reabNeeds = useMemo(() => replenishPlan(state).filter((x) => x.need > 0 || x.status === "urgente").length, [state]);
  const newOrders = state.orders.filter((o) => o.stage === "nuevo").length;
  const pendingReceipts = state.receipts.filter((r) => r.status !== "completo").length;

  const groups: { title: string; items: NavItem[] }[] = [
    { title: "Operación", items: [
      { to: "/consola", label: "Tablero", icon: LayoutDashboard },
      { to: "/consola/entradas", label: "Entradas", icon: PackageOpen, badge: pendingReceipts },
      { to: "/consola/salidas", label: "Salidas", icon: Truck, badge: al.exceptions.length || undefined, badgeTone: al.exceptions.length ? "blocked" : undefined },
      { to: "/consola/andenes", label: "Andenes y patio", icon: DoorOpen, badge: (al.yardWaiting.length || state.appointments.filter((a) => a.status === "en_patio" || a.status === "en_anden").length) || undefined, badgeTone: al.yardWaiting.length ? "warn" : undefined },
      { to: "/consola/devoluciones", label: "Devoluciones", icon: Undo2, badge: state.rmas.filter((r) => r.status !== "completo").length || undefined },
      { to: "/consola/oleadas", label: "Oleadas", icon: Waves, badge: newOrders },
      { to: "/consola/tareas", label: "Tareas", icon: ListChecks, badge: openTasks },
    ]},
    { title: "Inventario", items: [
      { to: "/consola/existencias", label: "Existencias", icon: Boxes, badge: al.lowStock.length || undefined, badgeTone: "warn" },
      { to: "/consola/reabasto", label: "Reabasto", icon: RefreshCw, badge: reabNeeds || undefined, badgeTone: "warn" },
      { to: "/consola/productos", label: "Productos", icon: Tag },
      { to: "/consola/ubicaciones", label: "Ubicaciones", icon: Map },
      { to: "/consola/conteos", label: "Conteos", icon: ClipboardCheck, badge: al.approvals.length || undefined, badgeTone: "warn" },
      { to: "/consola/cuarentena", label: "Cuarentena", icon: ShieldAlert, badge: qItems || undefined, badgeTone: "warn" },
    ]},
    { title: "Control", items: [
      { to: "/consola/movimientos", label: "Movimientos", icon: History },
      { to: "/consola/trazabilidad", label: "Trazabilidad", icon: GitBranch },
      { to: "/consola/cumplimiento", label: "Cumplimiento", icon: ShieldCheck, badge: (al.openRecalls.length + al.unreviewed.length) || undefined, badgeTone: al.openRecalls.length ? "blocked" : "warn" },
      { to: "/consola/reportes", label: "Reportes y KPIs", icon: BarChart3 },
      { to: "/consola/bitacora", label: "Bitácora", icon: ScrollText },
    ]},
    { title: "Configuración", items: [
      { to: "/consola/reglas", label: "Reglas", icon: SlidersHorizontal },
      { to: "/consola/usuarios", label: "Usuarios y roles", icon: Users },
    ]},
  ];

  const ctx = useMemo(() => ({ user, setUser: setUserId, inspect: setTarget }), [user, setUserId]);
  const current = groups.flatMap((g) => g.items).filter((i) => loc.pathname === i.to || (i.to !== "/consola" && loc.pathname.startsWith(i.to))).at(-1);

  // WCAG 2.4.2: título de página por ruta
  useEffect(() => { document.title = `${current?.label ?? "Tablero"} · Almacena`; }, [current?.label]);

  // WCAG 2.1.1: las filas que abren detalle se operan con teclado (Tab + Enter/Espacio)
  useEffect(() => {
    const mark = () => document.querySelectorAll<HTMLTableRowElement>("tr.clickable:not([tabindex])").forEach((tr) => {
      tr.tabIndex = 0;
      const cells = [...tr.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3);
      tr.setAttribute("aria-label", `${cells.join(" · ")} — abrir detalle`);
    });
    mark();
    const mo = new MutationObserver(mark);
    mo.observe(document.body, { childList: true, subtree: true });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.key === "Enter" || e.key === " ") && t.matches?.("tr.clickable")) { e.preventDefault(); t.click(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { mo.disconnect(); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <ConsoleCtx.Provider value={ctx}>
      <div className={`console ${collapsed ? "is-collapsed" : ""}`}>
        <a href="#" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("contenido")?.focus(); }}>Saltar al contenido</a>
        <aside className="side">
          <div className="side-brand">
            <span className="logo"><Warehouse size={18} /></span>
            {!collapsed && <div><strong>Almacena</strong><small>{state.warehouse.code} · {state.warehouse.name}</small></div>}
          </div>
          <nav aria-label="Navegación principal">
            {groups.map((g) => (
              <div key={g.title} className="side-group">
                {!collapsed && <div className="side-title">{g.title}</div>}
                {g.items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === "/consola"} className="side-link" title={collapsed ? i.label : undefined} aria-label={collapsed ? `${i.label}${i.badge ? `, ${i.badge} pendientes` : ""}` : undefined}>
                    <i.icon size={17} />
                    {!collapsed && <span>{i.label}</span>}
                    {!!i.badge && <em className={`side-badge ${i.badgeTone ?? ""}`}>{i.badge}</em>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <NavLink to="/handheld" className="side-link" target="_blank" title="Abrir app de piso" aria-label="Abrir handheld en una pestaña nueva">
              <Smartphone size={17} />{!collapsed && <span>Abrir handheld</span>}
            </NavLink>
            <button className="side-link" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expandir menú" : "Contraer menú"}>
              {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}{!collapsed && <span>Contraer</span>}
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="top">
            <div className="crumbs">
              <span className="muted">{groups.find((g) => g.items.includes(current!))?.title ?? "Operación"}</span>
              <span className="muted">/</span>
              <strong>{current?.label ?? "Tablero"}</strong>
            </div>
            <button className="search-trigger" onClick={() => setPalette(true)} aria-keyshortcuts="Meta+K /" aria-haspopup="dialog">
              <Search size={15} />
              <span>Buscar SKU, código de barras, lote, ubicación, pedido…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <div className="row gap-3">
              {state.queue.length > 0 && (
                <span className="pill tone-warn" title="Escaneos del handheld esperando señal"><WifiOff size={13} /> {state.queue.length} en cola offline</span>
              )}
              <UserMenu userId={user.id} onChange={setUserId} onReset={() => {
                if (!can(user.role, "data.reset")) return;
                dispatch({ type: "RESET" });
              }} />
            </div>
          </header>
          <main className="content" id="contenido" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
        <Inspector target={target} onClose={() => setTarget(null)} onNavigate={setTarget} />
        {palette && <Palette onClose={() => setPalette(false)} onPick={(t) => { setPalette(false); setTarget(t); }} />}
      </div>
    </ConsoleCtx.Provider>
  );
}

function UserMenu({ userId, onChange, onReset }: { userId: string; onChange: (id: string) => void; onReset: () => void }) {
  const { state } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const me = state.users.find((u) => u.id === userId)!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && ref.current?.contains(document.activeElement)) { setOpen(false); ref.current?.querySelector<HTMLButtonElement>(".user-btn")?.focus(); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const deskUsers = state.users.filter((u) => u.role !== "operario");
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Avatar initials={me.initials} size={28} />
        <span className="user-meta"><strong>{me.name}</strong><small>{ROLE_LABEL[me.role]}</small></span>
        <span className="sr-only">. Cambiar de rol</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-title">Cambiar de rol (demo)</div>
          {deskUsers.map((u) => (
            <button key={u.id} role="menuitemradio" aria-checked={u.id === userId} className={u.id === userId ? "on" : ""}
              onClick={() => { onChange(u.id); setOpen(false); toast(`Ahora ves la consola como ${ROLE_LABEL[u.role]}`, "info"); }}>
              <Avatar initials={u.initials} size={22} />
              <span><strong>{u.name}</strong><small>{ROLE_LABEL[u.role]}</small></span>
            </button>
          ))}
          <div className="menu-sep" />
          <button disabled={!can(me.role, "data.reset")} title={can(me.role, "data.reset") ? undefined : whyNot("data.reset")}
            onClick={() => { onReset(); setOpen(false); toast("Datos de demostración restablecidos"); }}>
            <RotateCcw size={15} /> <span>Restablecer datos demo</span>
          </button>
        </div>
      )}
    </div>
  );
}

const hitLabel: Record<LookupHit["kind"], string> = {
  producto: "Producto", ubicacion: "Ubicación", lote: "Lote", pedido: "Pedido", recepcion: "Recepción", tarea: "Tarea",
  rma: "Devolución", cita: "Cita andén",
};

function Palette({ onClose, onPick }: { onClose: () => void; onPick: (t: InspectTarget) => void }) {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const hits = useMemo(() => lookup(state, q), [state, q]);
  const dlg = useDialog(true, onClose);
  const toTarget = (h: LookupHit): InspectTarget =>
    h.kind === "producto" ? { kind: "producto", id: h.product.sku }
    : h.kind === "ubicacion" ? { kind: "ubicacion", id: h.location.code }
    : h.kind === "lote" ? { kind: "lote", id: h.lot.code }
    : h.kind === "pedido" ? { kind: "pedido", id: h.order.id }
    : h.kind === "recepcion" ? { kind: "recepcion", id: h.id }
    : h.kind === "rma" ? { kind: "rma", id: h.rma.id }
    : h.kind === "cita" ? { kind: "cita", id: h.appt.id }
    : { kind: "tarea", id: h.task.id };
  const describe = (h: LookupHit) =>
    h.kind === "producto" ? [h.product.sku, `${h.product.emoji} ${h.product.name}`]
    : h.kind === "ubicacion" ? [h.location.code, `Zona ${h.location.zone} · ${h.location.type}`]
    : h.kind === "lote" ? [h.lot.code, `${h.lot.sku} · cad. ${h.lot.expiryDate ?? "n/a"}`]
    : h.kind === "pedido" ? [h.order.id, h.order.customer]
    : h.kind === "recepcion" ? [h.id, state.receipts.find((r) => r.id === h.id)?.supplier ?? ""]
    : h.kind === "rma" ? [h.rma.id, `${h.rma.order} · ${h.rma.customer}`]
    : h.kind === "cita" ? [h.appt.id, `${h.appt.party} · ${h.appt.door ?? "sin puerta"}${h.appt.plate ? " · " + h.appt.plate : ""}`]
    : [h.task.id, h.task.type];
  const shortcuts = [
    { label: "Planear oleada", to: "/consola/oleadas" }, { label: "Agenda de andenes", to: "/consola/andenes" }, { label: "Ver tareas abiertas", to: "/consola/tareas" },
    { label: "Mapa de ubicaciones", to: "/consola/ubicaciones" }, { label: "KPIs", to: "/consola/reportes" },
  ];
  return (
    <div className="overlay centered top-aligned" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Búsqueda universal" ref={dlg}>
        <div className="palette-in">
          <Search size={18} />
          <input data-autofocus value={q} placeholder="Escanea o escribe cualquier código…" onChange={(e) => { setQ(e.target.value); setI(0); }}
            role="combobox" aria-label="Buscar por SKU, código de barras, lote, ubicación o pedido" aria-expanded={hits.length > 0} aria-controls={hits.length ? "palette-results" : undefined}
            aria-activedescendant={hits[i] ? `hit-${i}` : undefined} aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter" && hits[i]) onPick(toTarget(hits[i]));
            }} />
          <Kbd>Esc</Kbd>
        </div>
        <div className="palette-list" id="palette-results" role={hits.length ? "listbox" : undefined} aria-label={hits.length ? "Resultados" : undefined}>
          <div className="sr-only" aria-live="polite">{q ? `${hits.length} resultados` : ""}</div>
          {!q && (
            <>
              <div className="menu-title">Ir a</div>
              {shortcuts.map((s) => <button key={s.to} onClick={() => { onClose(); nav(s.to); }}>{s.label}</button>)}
              <div className="menu-title">Prueba con</div>
              <div className="palette-try">
                {["7501003058710", "A-01-01-1", "LCAF2610", "PED-5008", "OC-1042", "RMA", "CDMX-99M"].map((c) => <button key={c} className="code" onClick={() => setQ(c)}>{c}</button>)}
              </div>
            </>
          )}
          {q && !hits.length && <div className="palette-empty">Sin resultados para “{q}”. Prueba con un SKU, EAN-13, lote o pedido.</div>}
          {hits.map((h, j) => {
            const [code, desc] = describe(h);
            return (
              <button key={h.kind + code} id={`hit-${j}`} role="option" aria-selected={i === j} tabIndex={-1} className={i === j ? "on" : ""} onMouseEnter={() => setI(j)} onClick={() => onPick(toTarget(h))}>
                <span className="pill tone-neutral">{hitLabel[h.kind]}</span>
                <span className="mono">{code}</span>
                <span className="muted ellipsis">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
