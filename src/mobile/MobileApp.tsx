import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import { PackageOpen, ArrowDownToLine, ShoppingBasket, Package, ClipboardList, Search, Wifi, WifiOff, LogOut, ChevronRight, Undo2, Truck, Settings2, RefreshCw } from "lucide-react";
import { useStore, useSessionUser, ROLE_LABEL } from "../core/store";
import { nextTaskFor, pickTaskLabel } from "../core/engine";
import type { Task, User } from "../core/types";
import { FeedbackProvider } from "./parts";
import { PrefsProvider, prefsClass, usePrefsState } from "./prefs";
import { Preferences } from "./screens/Preferences";
import { ReceiveList, ReceiveFlow } from "./screens/Receive";
import { PutawayList, PutawayFlow } from "./screens/Putaway";
import { PickList, PickFlow } from "./screens/Pick";
import { PackFlow } from "./screens/Pack";
import { CountList, CountFlow } from "./screens/Count";
import { Lookup } from "./screens/Lookup";
import { ReturnList, ReturnFlow } from "./screens/Return";
import { LoadList, LoadFlow } from "./screens/Load";
import { WithdrawFlow } from "./screens/Withdraw";
import { ReplenishList, ReplenishFlow } from "./screens/Replenish";
import { TASK_LABEL } from "../ui/format";

const MobileCtx = createContext<{ user: User; logout: () => void } | null>(null);
export const useHH = () => {
  const c = useContext(MobileCtx);
  if (!c) throw new Error("fuera del handheld");
  return c;
};

export const taskPath = (t: Task) =>
  t.type === "surtir" ? `/handheld/surtir/${t.id}` : t.type === "ubicar" ? `/handheld/ubicar/${t.id}`
  : t.type === "retirar" ? `/handheld/retirar/${t.id}` : t.type === "reabastecer" ? `/handheld/reabastecer/${t.id}` : `/handheld/contar/${t.id}`;

/** Remonta la pantalla al cambiar de tarea/documento para no arrastrar el paso anterior. */
function ByTask({ C }: { C: () => React.ReactElement }) {
  const { id } = useParams();
  return <C key={id} />;
}

export function MobileApp() {
  const framed = window.self !== window.top;
  const { state } = useStore();
  const [userId, setUserId] = useSessionUser("mobile");
  const user = state.users.find((u) => u.id === userId);
  const prefsState = usePrefsState(user?.id);
  const ctx = useMemo(() => (user ? { user, logout: () => setUserId(undefined) } : null), [user, setUserId]);
  useEffect(() => { if (!framed) document.title = "Handheld · Magnus WMS"; }, [framed]);

  return (
    <div className={`hh-root ${framed ? "framed" : ""} ${prefsClass(prefsState.prefs)}`}>
      <PrefsProvider value={prefsState}>
      <FeedbackProvider sound={prefsState.prefs.sound} vibrate={prefsState.prefs.vibrate}>
        <StatusBar user={user} />
        {!ctx ? <Login onLogin={setUserId} /> : (
          <MobileCtx.Provider value={ctx}>
            <Routes>
              <Route index element={<Home />} />
              <Route path="recibir" element={<ReceiveList />} />
              <Route path="recibir/:id" element={<ByTask C={ReceiveFlow} />} />
              <Route path="ubicar" element={<PutawayList />} />
              <Route path="ubicar/:id" element={<ByTask C={PutawayFlow} />} />
              <Route path="surtir" element={<PickList />} />
              <Route path="surtir/:id" element={<ByTask C={PickFlow} />} />
              <Route path="empacar" element={<ByTask C={PackFlow} />} />
              <Route path="contar" element={<CountList />} />
              <Route path="contar/:id" element={<ByTask C={CountFlow} />} />
              <Route path="consultar" element={<Lookup />} />
              <Route path="preferencias" element={<Preferences />} />
              <Route path="devolver" element={<ReturnList />} />
              <Route path="devolver/:id" element={<ByTask C={ReturnFlow} />} />
              <Route path="cargar" element={<LoadList />} />
              <Route path="cargar/:id" element={<ByTask C={LoadFlow} />} />
              <Route path="retirar/:id" element={<ByTask C={WithdrawFlow} />} />
              <Route path="reabastecer" element={<ReplenishList />} />
              <Route path="reabastecer/:id" element={<ByTask C={ReplenishFlow} />} />
            </Routes>
          </MobileCtx.Provider>
        )}
      </FeedbackProvider>
      </PrefsProvider>
    </div>
  );
}

function StatusBar({ user }: { user?: User }) {
  const { state, dispatch } = useStore();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30_000); return () => clearInterval(t); }, []);
  return (
    <div className="hh-status">
      <span>{clock.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
      <span className="hh-status-mid">{state.warehouse.code}{user && ` · ${user.initials}`}</span>
      <button className={`hh-net ${state.offline ? "off" : ""}`} onClick={() => dispatch({ type: "SET_OFFLINE", offline: !state.offline })}
        aria-label={state.offline ? "Sin señal: toca para reconectar" : "En línea: toca para simular caída de Wi-Fi"}>
        {state.offline ? <WifiOff size={15} /> : <Wifi size={15} />}
        {state.offline ? (state.queue.length ? `${state.queue.length} en cola` : "Sin señal") : "En línea"}
      </button>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (id: string) => void }) {
  const { state } = useStore();
  const [shift, setShift] = useState("Matutino");
  const floor = state.users.filter((u) => u.role === "operario" || u.role === "empacador");
  return (
    <div className="hh-screen">
      <div className="hh-body hh-login">
        <img className="hh-logo" src={`${import.meta.env.BASE_URL}magnus-logo.png`} alt="" />
        <h1>Magnus WMS · Piso</h1>
        <p className="hh-muted">{state.warehouse.code} · {state.warehouse.name}</p>
        <div className="hh-seg" role="radiogroup" aria-label="Turno">
          {["Matutino", "Vespertino", "Nocturno"].map((s) => (
            <button key={s} role="radio" aria-checked={shift === s} className={shift === s ? "on" : ""} onClick={() => setShift(s)}>{s}</button>
          ))}
        </div>
        <p className="hh-label">¿Quién eres? Escanea tu gafete o toca tu nombre</p>
        <div className="hh-users">
          {floor.map((u) => (
            <button key={u.id} className="hh-user" onClick={() => onLogin(u.id)}>
              <span className="hh-avatar">{u.initials}</span>
              <span><strong>{u.name}</strong><small>{ROLE_LABEL[u.role]}</small></span>
              <ChevronRight size={22} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Home() {
  const { state } = useStore();
  const { user, logout } = useHH();
  const nav = useNavigate();
  const next = nextTaskFor(state, user.id);
  const mine = state.tasks.filter((t) => t.status !== "completo" && t.assignee === user.id).length;

  const tiles = [
    { to: "recibir", label: "Recibir", icon: PackageOpen, n: state.receipts.filter((r) => r.status !== "completo").length },
    { to: "ubicar", label: "Ubicar", icon: ArrowDownToLine, n: state.tasks.filter((t) => t.type === "ubicar" && t.status !== "completo").length },
    { to: "surtir", label: "Surtir", icon: ShoppingBasket, n: state.tasks.filter((t) => t.type === "surtir" && t.status !== "completo" && (t.assignee === user.id || !t.assignee)).length },
    { to: "empacar", label: "Empacar", icon: Package, n: state.orders.filter((o) => o.stage === "surtido").length },
    { to: "reabastecer", label: "Reabastecer", icon: RefreshCw, n: state.tasks.filter((t) => t.type === "reabastecer" && t.status !== "completo").length },
    { to: "contar", label: "Contar", icon: ClipboardList, n: state.tasks.filter((t) => t.type === "contar" && t.status !== "completo").length },
    { to: "cargar", label: "Cargar", icon: Truck, n: state.appointments.filter((a) => a.kind === "salida" && a.status === "en_anden").length },
    { to: "devolver", label: "Devolver", icon: Undo2, n: state.rmas.filter((r) => r.status !== "completo" && r.lines.some((l) => l.received < l.qty)).length },
    { to: "consultar", label: "Consultar", icon: Search },
  ];

  const desc = (t: Task) => {
    if (t.type === "surtir") {
      const o = state.orders.find((x) => x.id === t.doc);
      const left = t.steps!.filter((s) => s.status === "pendiente").length;
      return { big: pickTaskLabel(t), small: `${left} líneas por surtir${o ? ` · ${o.customer}` : ` · ruta única de ${new Set(t.steps!.map((s) => s.from)).size} paradas`}` };
    }
    if (t.type === "ubicar") {
      const p = state.products.find((x) => x.sku === t.sku);
      return { big: `${t.qty} × ${p?.name}`, small: `De ${t.from} a ${t.suggested}` };
    }
    if (t.type === "reabastecer") return { big: `Reabastecer ${t.suggested}`, small: `${t.qty} × ${state.products.find((x) => x.sku === t.sku)?.name} desde ${t.from}` };
    if (t.type === "retirar") return { big: `Retirar lote ${t.lot}`, small: `${t.qty} pzas de ${t.from} a cuarentena · recall ${t.doc}` };
    return { big: `Conteo ${t.doc}`, small: `${t.locations?.length} ubicaciones` };
  };

  return (
    <div className="hh-screen">
      <header className="hh-home-h">
        <div>
          <span className="hh-muted">Hola,</span>
          <h1>{user.name.split(" ")[0]}</h1>
        </div>
        <div className="row gap-2">
          <button className="hh-icon" onClick={() => nav("/handheld/preferencias")} aria-label="Preferencias de mano, letra y sonido"><Settings2 size={22} aria-hidden /></button>
          <button className="hh-icon" onClick={logout} aria-label="Cerrar sesión"><LogOut size={22} aria-hidden /></button>
        </div>
      </header>
      <div className="hh-body">
        {next ? (
          <button className={`hh-next type-${next.type}`} onClick={() => nav(taskPath(next))}>
            <span className="hh-next-label">Tu siguiente tarea · {TASK_LABEL[next.type]}{next.priority === 1 && " · urgente"}</span>
            <strong>{desc(next).big}</strong>
            <span>{desc(next).small}</span>
            <span className="hh-next-go">{next.status === "en_proceso" ? "Continuar" : "Empezar"} <ChevronRight size={22} /></span>
          </button>
        ) : (
          <div className="hh-next empty"><strong>No tienes tareas asignadas</strong><span>Toca un módulo para trabajar por iniciativa.</span></div>
        )}
        <div className="hh-muted small center">{mine} tarea(s) asignadas a ti · el sistema decide el orden por prioridad</div>
        <div className="hh-tiles">
          {tiles.map((t) => (
            <button key={t.to} className="hh-tile" onClick={() => nav(`/handheld/${t.to}`)}>
              <t.icon size={30} />
              <span>{t.label}</span>
              {!!t.n && <em aria-label={`${t.n} pendientes`}>{t.n}</em>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
