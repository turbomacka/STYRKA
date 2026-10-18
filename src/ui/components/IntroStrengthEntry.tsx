import { useState } from 'react';
import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';
import type { IntroStrengthDraft } from '../../application/onboardingDraft';
import { parseKg } from '../../domain/units';
import { validStrengthDate } from '../../domain/strengthInputs';
import { readStrengthDrafts } from './StrengthInputs';

/** TextField intentionally preserves raw comma input and never rounds/clamps a reported result. */
export function IntroStrengthEntry({ draft, onChange, today, attempted }: {
  draft: IntroStrengthDraft; onChange: (draft: IntroStrengthDraft) => void; today: string; attempted: boolean;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const update = (v: Partial<IntroStrengthDraft>) => onChange({ ...draft, ...v });
  const kg = parseKg(draft.kg);
  const weightError = !kg.ok || kg.grams <= 0 || kg.grams > 500_000;
  const repsError = draft.kind === 'submax' && !/^[1-8]$/.test(draft.reps);
  const dateError = !!draft.testedAt && (!validStrengthDate(draft.testedAt) || draft.testedAt > today);
  const ready = !readStrengthDrafts([draft], today).error;
  return <div className="stack intro-entry">
    <TextField className="field" value={draft.kg} onChange={(kg) => update({ kg })} isInvalid={(attempted || touched.kg) && weightError} onBlur={() => setTouched({ ...touched, kg: true })} validationBehavior="aria">
      <Label>Vikt (kg)</Label><Input inputMode="decimal" autoComplete="off" />
      {draft.kind === '1rm' && <Text slot="description" className="small muted">En uppskattning räcker.</Text>}
      <FieldError>Ange en vikt över 0 och högst 500 kg.</FieldError>
    </TextField>
    {draft.kind === 'submax' && <TextField className="field" value={draft.reps} onChange={(reps) => update({ reps })} isInvalid={(attempted || touched.reps) && repsError} onBlur={() => setTouched({ ...touched, reps: true })} validationBehavior="aria">
      <Label>Repetitioner (1–8)</Label><Input inputMode="numeric" autoComplete="off" /><FieldError>Ange 1–8 repetitioner.</FieldError>
    </TextField>}
    {draft.kind === '1rm' && <label className="check"><input type="checkbox" checked={draft.measured} onChange={(e) => update({ measured: e.target.checked })} /><span>Jag har lyft vikten för 1 repetition</span></label>}
    <details className="intro-details" open={dateError || undefined}>
      <summary>Fler detaljer <span className="muted">· valfritt</span></summary>
      <div className="stack">
        {draft.kind === 'submax' && <label className="field">Hur många fler repetitioner hade du kunnat göra?
          <select value={draft.rir} onChange={(e) => update({ rir: e.target.value })}>
            <option value="">Vet inte</option>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} kvar</option>)}
          </select><span className="small muted">Utan den uppgiften sparas setet utan att räknas om till maxstyrka.</span>
        </label>}
        <TextField className="field" value={draft.testedAt} onChange={(testedAt) => update({ testedAt })} isInvalid={dateError} validationBehavior="aria">
          <Label>När gjorde du det? (valfritt)</Label><Input type="date" max={today} /><FieldError>Ange ett giltigt datum, senast i dag.</FieldError>
        </TextField>
      </div>
    </details>
    <p className="intro-feedback" role="status">{ready ? '✓ Redo att fortsätta' : '\u00a0'}</p>
  </div>;
}
