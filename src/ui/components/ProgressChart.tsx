import { useId, useState } from 'react';
import type { StrengthPoint } from '../../application/history';
import { formatKg } from '../../domain/units';

/**
 * Enkel tillgänglig SVG-graf. Faktisk prestation (heldragen linje, fyllda punkter) skiljs från
 * uppskattad maxstyrka (streckad, ihåliga punkter) och uppmätt (romb). Former + text, inte färg ensam.
 * En tabell med samma data finns för skärmläsare.
 */
export function ProgressChart({ points, unit = 'kg', title }: { points: StrengthPoint[]; unit?: string; title: string }) {
  const id = useId();
  const [selection, setSelection] = useState<StrengthPoint | null>(null);
  const selected = points.find((p) => selection && p.at === selection.at && p.kg === selection.kg && p.source === selection.source && p.detail === selection.detail) ?? null;
  const sourceName = (p: StrengthPoint) => p.origin === 'input' ? 'Angiven styrkeuppgift' : p.source === 'performance' ? 'Faktisk prestation' : p.source === 'measured' ? 'Uppmätt' : 'Uppskattad maxstyrka (osäker)';
  if (!points.length) return <p className="muted chart-empty">Inga registrerade pass för övningen i vald period ännu. Dina värden visas här när du har tränat.</p>;
  const W = 340, H = 180, P = { l: 40, r: 10, t: 10, b: 24 };
  const ts = points.map((p) => Date.parse(p.at));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const vals = points.map((p) => p.kg);
  const lo = Math.floor(Math.min(...vals) * 0.95), hi = Math.ceil(Math.max(...vals) * 1.05) || 1;
  const x = (t: number) => P.l + (t1 === t0 ? (W - P.l - P.r) / 2 : ((t - t0) / (t1 - t0)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (hi === lo ? (H - P.t - P.b) / 2 : (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b));
  const series = (src: StrengthPoint['source']) => points.filter((p) => p.source === src && p.origin !== 'input');
  const inputs = points.filter((p) => p.origin === 'input');
  const path = (pts: StrengthPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(Date.parse(p.at)).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const perf = series('performance'), est = series('estimated'), meas = series('measured');
  const fmt = (v: number) => (unit === 's' ? String(v) : formatKg(Math.round(v * 1000)));
  const dateSv = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  return (
    <figure style={{ margin: 0 }}>
      <p className="small muted">{title} · {unit}</p>
      <div className="chart-plot">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${points.length} datapunkter. Se tabellen nedan för värden.`}>
        <g stroke="var(--border)" strokeWidth="1">
          {[lo, (lo + hi) / 2, hi].map((v) => (
            <line key={v} x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g fill="var(--text-2)" fontSize="11" textAnchor="end">
          {[lo, (lo + hi) / 2, hi].map((v) => (
            <text key={v} x={P.l - 4} y={y(v) + 4}>
              {fmt(Math.round(v))}
            </text>
          ))}
        </g>
        <g fill="var(--text-2)" fontSize="11">
          <text x={P.l} y={H - 6}>{dateSv(new Date(t0).toISOString())}</text>
          <text x={W - P.r} y={H - 6} textAnchor="end">{dateSv(new Date(t1).toISOString())}</text>
        </g>
        {perf.length > 1 && <path d={path(perf)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />}
        {perf.map((p, i) => <circle key={`p${i}`} cx={x(Date.parse(p.at))} cy={y(p.kg)} r="3.5" fill="var(--accent)" />)}
        {est.length > 1 && <path d={path(est)} fill="none" stroke="var(--text-2)" strokeWidth="2" strokeDasharray="5 4" />}
        {est.map((p, i) => <circle key={`e${i}`} cx={x(Date.parse(p.at))} cy={y(p.kg)} r="4" fill="var(--surface)" stroke="var(--text-2)" strokeWidth="2" />)}
        {meas.map((p, i) => {
          const cx = x(Date.parse(p.at)), cy = y(p.kg);
          return <path key={`m${i}`} d={`M${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} L${cx - 6},${cy} Z`} fill="var(--ok)" />;
        })}
        {inputs.map((p,i) => <rect key={`input${i}`} x={x(Date.parse(p.at))-5} y={y(p.kg)-5} width="10" height="10" fill="var(--surface)" stroke="var(--text-2)" strokeWidth="2" />)}
      </svg>
      {points.map((p, i) => <button type="button" className="chart-point" key={`${p.at}-${p.source}-${i}`} tabIndex={-1} aria-label={`${sourceName(p)}, ${dateSv(p.at)}, ${fmt(p.kg)} ${unit}`} aria-pressed={selected === p} style={{ left: `${x(Date.parse(p.at)) / W * 100}%`, top: `${y(p.kg) / H * 100}%` }} onClick={() => setSelection(p)} />)}
      </div>
      <figcaption className="legend" style={{ marginTop: 8 }}>
        {inputs.length > 0 && <span><svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="var(--surface)" stroke="var(--text-2)" strokeWidth="2" /></svg> Angiven styrkeuppgift · separat referens</span>}
        <span><svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--accent)" strokeWidth="2.5" /><circle cx="11" cy="5" r="3.5" fill="var(--accent)" /></svg> Faktisk prestation</span>
        {est.length > 0 && <span><svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--text-2)" strokeWidth="2" strokeDasharray="4 3" /><circle cx="11" cy="5" r="3.5" fill="var(--surface)" stroke="var(--text-2)" strokeWidth="2" /></svg> Uppskattad maxstyrka (osäker)</span>}
        {meas.length > 0 && <span><svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,7 L7,13 L1,7 Z" fill="var(--ok)" /></svg> Uppmätt</span>}
      </figcaption>
      <div className="chart-tooltip" role="status" aria-live="polite" aria-atomic="true">
        {selected ? <><p><strong className="num">{fmt(selected.kg)} {unit}</strong> · {new Date(selected.at).toLocaleDateString('sv-SE')}</p><p className="small">{sourceName(selected)} · {selected.detail}</p></> : <p className="small muted">Tryck på en punkt eller välj ett värde nedan för att se datum och detaljer.</p>}
      </div>
      <div className="field chart-selector">
        <label htmlFor={`${id}-point`}>Välj datapunkt</label>
        <select id={`${id}-point`} value={selected ? points.indexOf(selected) : ''} onChange={(e) => setSelection(e.target.value === '' ? null : points[Number(e.target.value)])}>
          <option value="">Välj ett värde</option>
          {points.map((p, i) => <option value={i} key={i}>{dateSv(p.at)} · {fmt(p.kg)} {unit} · {sourceName(p)}</option>)}
        </select>
      </div>
      <details>
        <summary>Visa värden som tabell</summary>
        <div className="chart-table">
        <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr><th scope="col" style={{ textAlign: 'left' }}>Datum</th><th scope="col" style={{ textAlign: 'right' }}>Värde</th><th scope="col" style={{ textAlign: 'left' }}>Typ</th></tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>{dateSv(p.at)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{fmt(p.kg)} {unit}</td>
                <td>{sourceName(p)} – {p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
    </figure>
  );
}
