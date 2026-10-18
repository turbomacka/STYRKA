import { useState } from 'react';
import { getHaptics, getTheme, refinedDesign, setHaptics, setTheme, supportsHaptics, type Theme } from '../design';
import { Segmented } from './common';

export function Appearance() {
  const [theme, updateTheme] = useState(getTheme);
  const [haptics, updateHaptics] = useState(getHaptics);
  if (!refinedDesign) return null;
  return <section className="card stack" aria-labelledby="appearance-title">
    <h2 id="appearance-title">Utseende och respons</h2>
    <Segmented<Theme> label="Färgtema" value={theme} options={[{ value: 'auto', label: 'Som enheten' }, { value: 'light', label: 'Ljust' }, { value: 'dark', label: 'Mörkt' }]} onChange={(v) => { setTheme(v); updateTheme(v); }} />
    {supportsHaptics() && <label className="check">
      <input type="checkbox" checked={haptics} onChange={(e) => { setHaptics(e.target.checked); updateHaptics(e.target.checked); }} />
      <span>Kort vibration när ett set registreras<span className="block-text small muted">Om din enhet stöder det. Av som standard.</span></span>
    </label>}
    <p className="small muted">Inställningarna gäller den här enheten.</p>
  </section>;
}
