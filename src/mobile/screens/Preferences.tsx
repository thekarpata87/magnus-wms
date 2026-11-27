import { Hand, Type, Volume2, Vibrate } from "lucide-react";
import { TaskScreen, useFeedback } from "../parts";
import { usePrefs, type HhPrefs } from "../prefs";
import { useHH } from "../MobileApp";

function Seg<K extends string>({ label, value, onChange, items }: { label: string; value: K; onChange: (v: K) => void; items: { id: K; label: string }[] }) {
  return (
    <div className="hh-seg" role="radiogroup" aria-label={label}>
      {items.map((i) => (
        <button key={i.id} role="radio" aria-checked={value === i.id} className={value === i.id ? "on" : ""} onClick={() => onChange(i.id)}>{i.label}</button>
      ))}
    </div>
  );
}

function Toggle({ label, desc, on, onChange, icon }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void; icon: React.ReactNode }) {
  return (
    <button className="hh-toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="row gap-3">{icon}<span><strong>{label}</strong><br /><small className="hh-muted">{desc}</small></span></span>
      <span className="hh-switch" aria-hidden />
    </button>
  );
}

export function Preferences() {
  const { prefs, set } = usePrefs();
  const { user } = useHH();
  const fb = useFeedback();
  const upd = (p: Partial<HhPrefs>) => set(p);

  return (
    <TaskScreen title="Preferencias" context={`${user.name} · se guardan en este dispositivo`}>
      <section className="hh-pref" aria-labelledby="pref-hand">
        <h2 id="pref-hand" className="row gap-2"><Hand size={18} aria-hidden /> Mano dominante</h2>
        <Seg label="Mano dominante" value={prefs.hand} onChange={(hand) => { upd({ hand }); fb(true, hand === "izquierda" ? "Modo zurdo activado" : "Modo diestro activado"); }}
          items={[{ id: "derecha", label: "Derecha" }, { id: "izquierda", label: "Izquierda" }]} />
        <div className="hh-preview">
          <div className="hh-mini" aria-hidden>
            <i className="m-instr" /><i className="m-scan" />
            <div className="m-row"><i className="m-exc" /></div>
            <i className="m-primary" />
            <span className="m-thumb" />
          </div>
          <p className="hh-muted small">
            La acción principal ocupa todo el ancho abajo. Las excepciones (Faltante, Dañado…) se mueven al lado
            <strong> {prefs.hand === "izquierda" ? "derecho" : "izquierdo"}</strong>, lejos de tu pulgar, para evitar toques accidentales;
            “+” y “borrar” quedan de tu lado. El teclado 1-2-3 no cambia.
          </p>
        </div>
      </section>

      <section className="hh-pref" aria-labelledby="pref-text">
        <h2 id="pref-text" className="row gap-2"><Type size={18} aria-hidden /> Tamaño de letra</h2>
        <Seg label="Tamaño de letra" value={prefs.text} onChange={(text) => upd({ text })}
          items={[{ id: "normal", label: "Normal" }, { id: "grande", label: "Grande" }, { id: "extra", label: "Extra" }]} />
        <p className="hh-muted small">“Extra” también agranda los botones y muestra el menú en 2 columnas.</p>
      </section>

      <section className="hh-pref" aria-labelledby="pref-fb">
        <h2 id="pref-fb">Confirmación de escaneo</h2>
        <Toggle label="Sonido" desc="Tono agudo al acertar, doble tono grave al fallar" on={prefs.sound} onChange={(sound) => upd({ sound })} icon={<Volume2 size={22} aria-hidden />} />
        <Toggle label="Vibración" desc="Pulso corto al acertar, doble al fallar" on={prefs.vibrate} onChange={(vibrate) => upd({ vibrate })} icon={<Vibrate size={22} aria-hidden />} />
        <div className="row gap-2">
          <button className="hh-ghost grow" onClick={() => fb(true, "Así suena un escaneo correcto")}>Probar acierto</button>
          <button className="hh-ghost grow" onClick={() => fb(false, "Así suena un error")}>Probar error</button>
        </div>
        <p className="hh-muted small">El color de pantalla completa siempre se muestra: es la confirmación que no depende del oído ni del tacto.</p>
      </section>
    </TaskScreen>
  );
}
