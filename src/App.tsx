import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { Monitor, Smartphone, Columns2 } from "lucide-react";
import { StoreProvider } from "./core/store";
import { ToastProvider } from "./ui/kit";
import { ConsoleLayout } from "./console/Layout";
import { Dashboard } from "./console/pages/Dashboard";
import { Inbound } from "./console/pages/Inbound";
import { Outbound } from "./console/pages/Outbound";
import { Waves } from "./console/pages/Waves";
import { Tasks } from "./console/pages/Tasks";
import { Stock, Products } from "./console/pages/Inventory";
import { Locations } from "./console/pages/Locations";
import { Counts } from "./console/pages/Counts";
import { Movements, Traceability, Audit } from "./console/pages/Control";
import { Reports } from "./console/pages/Reports";
import { Rules, UsersRoles } from "./console/pages/Settings";
import { MobileApp } from "./mobile/MobileApp";
import { Docks } from "./console/pages/Docks";
import { Returns } from "./console/pages/Returns";
import { Compliance } from "./console/pages/Compliance";
import { Quarantine } from "./console/pages/Quarantine";
import { Replenish } from "./console/pages/Replenish";

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/demo" element={<Split />} />
            <Route path="/handheld/*" element={<MobileApp />} />
            <Route path="/consola" element={<ConsoleLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="entradas" element={<Inbound />} />
              <Route path="salidas" element={<Outbound />} />
              <Route path="oleadas" element={<Waves />} />
              <Route path="andenes" element={<Docks />} />
              <Route path="devoluciones" element={<Returns />} />
              <Route path="tareas" element={<Tasks />} />
              <Route path="existencias" element={<Stock />} />
              <Route path="productos" element={<Products />} />
              <Route path="ubicaciones" element={<Locations />} />
              <Route path="conteos" element={<Counts />} />
              <Route path="cuarentena" element={<Quarantine />} />
              <Route path="reabasto" element={<Replenish />} />
              <Route path="movimientos" element={<Movements />} />
              <Route path="trazabilidad" element={<Traceability />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="bitacora" element={<Audit />} />
              <Route path="cumplimiento" element={<Compliance />} />
              <Route path="reglas" element={<Rules />} />
              <Route path="usuarios" element={<UsersRoles />} />
            </Route>
          </Routes>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  );
}

function Landing() {
  const cards = [
    { to: "/demo", icon: Columns2, title: "Vista dividida", desc: "Consola y handheld lado a lado. Escanea en el piso y mira el tablero actualizarse al instante.", tag: "Recomendado para demo" },
    { to: "/consola", icon: Monitor, title: "Consola web", desc: "Supervisor, gerente, administrador y auditor: tablero, oleadas, inventario, reglas y trazabilidad." },
    { to: "/handheld", icon: Smartphone, title: "App de piso", desc: "Operario y empacador: recibir, ubicar, surtir, empacar, contar y consultar. Ábrela en tu celular." },
  ];
  return (
    <div className="landing">
      <div className="landing-in">
        <div className="row gap-3"><img className="logo lg" src={`${import.meta.env.BASE_URL}magnus-logo.png`} alt="" /><div><h1>WMS <span className="by">by Magnus Manufactura</span></h1><p className="muted">Prototipo funcional de WMS · Fase 1 (MVP) + funciones de eficiencia de piso</p></div></div>
        <div className="landing-grid">
          {cards.map((c) => (
            <Link key={c.to} to={c.to} className="landing-card">
              <c.icon size={28} />
              <strong>{c.title}</strong>
              <p>{c.desc}</p>
              {c.tag && <span className="pill tone-brand">{c.tag}</span>}
            </Link>
          ))}
        </div>
        <p className="muted small">Los datos son ficticios y viven en este navegador (localStorage). Restablécelos desde el menú de usuario de la consola.</p>
      </div>
    </div>
  );
}

function Split() {
  return (
    <div className="split">
      <iframe title="Consola" src="#/consola" className="split-console" />
      <div className="split-device">
        <div className="device">
          <div className="device-notch" />
          <iframe title="Handheld" src="#/handheld" />
        </div>
        <p className="muted small center">Handheld simulado · usa los botones “Simular gatillo” o un escáner USB/Bluetooth</p>
      </div>
    </div>
  );
}
