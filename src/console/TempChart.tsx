// Línea de temperatura de un sensor: una serie (sin leyenda; el título la nombra), banda neutra del rango
// permitido, puntos fuera de rango en color de estado crítico + etiqueta, crosshair con tooltip.
import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Sensor } from "../core/types";
import { time } from "../ui/format";

const W = 640, H = 170, PAD = { l: 36, r: 12, t: 10, b: 22 };

export function TempChart({ sensor }: { sensor: Sensor }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const rs = sensor.readings;
  const t0 = rs[0].ts, t1 = rs[rs.length - 1].ts;
  const lo = Math.floor(Math.min(sensor.min - 2, ...rs.map((r) => r.t)));
  const hi = Math.ceil(Math.max(sensor.max + 2, ...rs.map((r) => r.t)));
  const x = (ts: number) => PAD.l + ((ts - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (t: number) => PAD.t + (1 - (t - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const out = (t: number) => t > sensor.max || t < sensor.min;
  const path = rs.map((r, i) => `${i ? "L" : "M"}${x(r.ts).toFixed(1)},${y(r.t).toFixed(1)}`).join("");
  const yTicks = [lo, sensor.min, sensor.max, hi].filter((v, i, a) => a.indexOf(v) === i);
  const xTicks = rs.filter((_, i) => i % 12 === 0);

  const onMove = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    rs.forEach((r, i) => { if (Math.abs(x(r.ts) - px) < Math.abs(x(rs[best].ts) - px)) best = i; });
    setHover(best);
  };
  const hr = hover !== null ? rs[hover] : null;

  return (
    <div className="tchart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
        aria-label={`Temperatura de ${sensor.name}, últimas 24 horas. Rango permitido ${sensor.min} a ${sensor.max} grados. ${rs.filter((r) => out(r.t)).length} lecturas fuera de rango. Usa flechas izquierda y derecha para recorrer las lecturas.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        onFocus={() => setHover((h) => h ?? rs.length - 1)} onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "End" ? rs.length : e.key === "Home" ? -rs.length : 0;
          if (!step) return;
          e.preventDefault();
          setHover((h) => Math.max(0, Math.min(rs.length - 1, (h ?? rs.length - 1) + step)));
        }}>
        <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(sensor.max)} height={y(sensor.min) - y(sensor.max)} className="tc-band" />
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === sensor.min || v === sensor.max ? "tc-limit" : "tc-grid"} />
            <text x={PAD.l - 6} y={y(v) + 4} className="tc-tick" textAnchor="end">{v}°</text>
          </g>
        ))}
        {xTicks.map((r) => <text key={r.ts} x={x(r.ts)} y={H - 6} className="tc-tick" textAnchor="middle">{time(r.ts)}</text>)}
        <path d={path} className="tc-line" />
        {rs.map((r) => out(r.t) && <circle key={r.ts} cx={x(r.ts)} cy={y(r.t)} r={4} className="tc-out" />)}
        {hr && <>
          <line x1={x(hr.ts)} x2={x(hr.ts)} y1={PAD.t} y2={H - PAD.b} className="tc-cross" />
          <circle cx={x(hr.ts)} cy={y(hr.t)} r={4.5} className={out(hr.t) ? "tc-out" : "tc-dot"} />
        </>}
      </svg>
      {hr && (
        <div className="tc-tip" style={{ left: `${Math.min(88, Math.max(12, (x(hr.ts) / W) * 100))}%` }} aria-live="polite">
          <strong>{time(hr.ts)}</strong>
          <span>{hr.t.toFixed(1)} °C · {hr.h}% HR</span>
          {out(hr.t) ? <span className="t-blocked"><AlertTriangle size={12} aria-hidden /> Fuera de rango ({sensor.min}–{sensor.max} °C)</span> : <span className="muted">En rango</span>}
        </div>
      )}
      <details className="tc-table">
        <summary>Ver lecturas en tabla</summary>
        <table className="tbl compact">
          <caption className="sr-only">Lecturas de {sensor.name}</caption>
          <thead><tr><th scope="col">Hora</th><th scope="col" className="r">°C</th><th scope="col" className="r">% HR</th><th scope="col">Estado</th></tr></thead>
          <tbody>{[...rs].reverse().map((r) => (
            <tr key={r.ts}><td className="mono">{time(r.ts)}</td><td className="r mono">{r.t.toFixed(1)}</td><td className="r mono">{r.h}</td>
              <td>{out(r.t) ? <span className="t-blocked">Fuera de rango</span> : <span className="muted">En rango</span>}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  );
}
