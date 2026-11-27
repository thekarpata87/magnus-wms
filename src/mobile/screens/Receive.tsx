import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { useStore } from "../../core/store";
import { QtyPad, ScanField, Steps, TaskScreen, useFeedback } from "../parts";
import { useHH } from "../MobileApp";
import { time } from "../../ui/format";
import { buildGs1, eanFromGtin, parseGs1 } from "../../core/gs1";

export function ReceiveList() {
  const { state } = useStore();
  const nav = useNavigate();
  const fb = useFeedback();
  const open = state.receipts.filter((r) => r.status !== "completo").sort((a, b) => a.appointment - b.appointment);
  return (
    <TaskScreen title="Recibir" context="Escanea la OC o el ASN del proveedor">
      <ScanField placeholder="Escanea OC o ASN" onScan={(c) => {
        const r = open.find((x) => x.id === c || x.asn === c);
        if (r) { fb(true, r.id); nav(`/handheld/recibir/${r.id}`); } else fb(false, `${c} no es una recepción abierta`);
      }} simulate={open.slice(0, 2).map((r) => ({ label: r.asn ?? r.id, code: r.asn ?? r.id, wrong: false })).concat([{ label: "Código inválido", code: "OC-9999", wrong: true }])} />
      <div className="hh-list">
        {open.map((r) => {
          const exp = r.lines.reduce((s, l) => s + l.expected, 0);
          const rec = r.lines.reduce((s, l) => s + l.received, 0);
          return (
            <button key={r.id} className="hh-row" onClick={() => nav(`/handheld/recibir/${r.id}`)}>
              <span><strong>{r.supplier}</strong><small>{r.id} · {r.dock} · cita {time(r.appointment)}</small></span>
              <em>{rec}/{exp}</em>
            </button>
          );
        })}
      </div>
    </TaskScreen>
  );
}

export function ReceiveFlow() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const { user } = useHH();
  const nav = useNavigate();
  const fb = useFeedback();
  const r = state.receipts.find((x) => x.id === id);
  const [received, setReceived] = useState<Record<string, number>>(() => Object.fromEntries(r?.lines.map((l) => [l.sku, l.received]) ?? []));
  const [sku, setSku] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [fromGs1, setFromGs1] = useState(false);
  if (!r) return <TaskScreen title="Recibir"><p>Recepción no encontrada.</p></TaskScreen>;

  const product = state.products.find((p) => p.sku === sku);
  const line = r.lines.find((l) => l.sku === sku);
  const remaining = line ? Math.max(0, line.expected - received[line.sku]) : 0;
  const totalExp = r.lines.reduce((s, l) => s + l.expected, 0);
  const totalRec = Object.values(received).reduce((s, n) => s + n, 0);
  const nextLine = r.lines.find((l) => received[l.sku] < l.expected);

  const onScanItem = (c: string) => {
    const gs1 = parseGs1(c);
    const code = gs1?.gtin ? eanFromGtin(gs1.gtin) : c;
    const p = state.products.find((x) => x.barcode === code || x.sku === code);
    const l = p && r.lines.find((x) => x.sku === p.sku);
    if (!p || !l) return fb(false, p ? `${p.name} no viene en esta OC` : "Código no reconocido");
    setSku(p.sku);
    const rem = Math.max(0, l.expected - received[l.sku]);
    setQty(gs1?.qty ? Math.min(gs1.qty, rem * 10) : rem);
    const d = new Date(Date.now() + 210 * 86_400_000).toISOString().slice(0, 10);
    setLot(p.lotTracked ? gs1?.lot ?? `L${p.sku.slice(0, 3)}${String(Date.now()).slice(-4)}` : "");
    setExpiry(p.expiryTracked ? gs1?.expiry ?? d : "");
    setFromGs1(!!gs1);
    fb(true, gs1 ? `GS1-128 · ${[gs1.lot && "lote", gs1.expiry && "caducidad", gs1.qty && "cantidad"].filter(Boolean).join(", ")} capturados` : p.name);
  };

  const confirm = () => {
    if (!product || !line || qty <= 0) return;
    if (product.lotTracked && !lot) return fb(false, "Captura el lote");
    if (product.expiryTracked && !expiry) return fb(false, "Captura la caducidad");
    dispatch({ type: "RECEIVE_LINE", receipt: r.id, sku: product.sku, qty, lot: lot || undefined, expiry: expiry || undefined, user: user.id, device: "Handheld" });
    setReceived((x) => ({ ...x, [product.sku]: x[product.sku] + qty }));
    fb(true, qty > remaining ? `Recibido con excedente (+${qty - remaining}) · etiqueta impresa` : "Recibido · etiqueta LPN impresa");
    setSku(null);
  };

  if (!product) {
    return (
      <TaskScreen title={`Recibir ${r.id}`} context={r.supplier} progress={[totalRec, totalExp]} back="/handheld/recibir"
        primary={<button className="hh-primary" disabled={!totalRec} onClick={() => { fb(true, "Recepción enviada a supervisor para cierre"); nav("/handheld/ubicar"); }}>Terminar y ubicar</button>}>
        <Steps items={["Escanear artículo", "Cantidad y lote", "Etiqueta"]} current={0} />
        <div className="hh-instr">
          <span>Escanea el artículo</span>
          <strong>{nextLine ? state.products.find((p) => p.sku === nextLine.sku)?.name : "Todo recibido"}</strong>
        </div>
        <ScanField placeholder="Escanea código de barras" onScan={onScanItem}
          simulate={[
            ...(nextLine ? [{ label: "Artículo esperado", code: state.products.find((p) => p.sku === nextLine.sku)!.barcode }] : []),
            ...(nextLine ? [{ label: "Etiqueta GS1-128", code: (() => {
              const np = state.products.find((p) => p.sku === nextLine.sku)!;
              const exp = np.expiryTracked ? new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10) : undefined;
              return buildGs1(np.barcode, np.lotTracked ? `L${np.sku.slice(0, 3)}${String(new Date().getDate()).padStart(2, "0")}88` : undefined, exp, nextLine.expected - received[nextLine.sku]);
            })() }] : []),
            { label: "Artículo que no viene", code: state.products.find((p) => p.sku === "TOR-14")!.barcode, wrong: true },
          ]} />
        <div className="hh-list">
          {r.lines.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku)!;
            const done = received[l.sku] >= l.expected;
            return (
              <div key={l.sku} className={`hh-row static ${done ? "done" : ""}`}>
                <span className="hh-emoji">{p.emoji}</span>
                <span><strong>{p.name}</strong><small>{p.sku}{p.lotTracked && " · requiere lote"}</small></span>
                <em>{received[l.sku]}/{l.expected}</em>
              </div>
            );
          })}
        </div>
      </TaskScreen>
    );
  }

  return (
    <TaskScreen title={`Recibir ${r.id}`} context={product.sku} progress={[totalRec, totalExp]} back="/handheld/recibir"
      primary={<button className="hh-primary" onClick={confirm} disabled={qty <= 0}><Printer size={22} /> Confirmar e imprimir etiqueta</button>}
      secondary={<button className="hh-ghost" onClick={() => setSku(null)}>Cancelar artículo</button>}>
      <Steps items={["Escanear artículo", "Cantidad y lote", "Etiqueta"]} current={1} />
      <div className="hh-product">
        <span className="hh-photo">{product.emoji}</span>
        <div><strong>{product.name}</strong><span>Esperado {line!.expected} · faltan {remaining}</span></div>
      </div>
      <QtyPad value={qty} onChange={setQty} max={remaining} />
      {(product.lotTracked || product.expiryTracked) && (
        <div className="hh-fields">
          {fromGs1 && <div className="hh-gs1">Datos leídos de la etiqueta GS1-128 del proveedor</div>}
          {product.lotTracked && <label>Lote<input value={lot} onChange={(e) => setLot(e.target.value.toUpperCase())} /></label>}
          {product.expiryTracked && <label>Caducidad<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>}
        </div>
      )}
    </TaskScreen>
  );
}
