import { Label, Radio, RadioGroup } from 'react-aria-components';
import type { TrainingPreferences } from '../../domain/trainingFlow';

export type LoadSource = NonNullable<TrainingPreferences['loadRecommendationSource']>;
export function LoadSourceChoice({ value, onChange, disabled = false, profile = false }: { value: LoadSource; onChange: (value: LoadSource) => void; disabled?: boolean; profile?: boolean }) {
  return <RadioGroup className="stack source-choice" value={value} onChange={(v) => onChange(v as LoadSource)} isDisabled={disabled}>
    <Label className="visually-hidden">Underlag för viktförslag</Label>
    <Radio className="source-option" value="performed_sets">
      <span className="choice-dot" aria-hidden="true" />
      <span><strong>Utgå från mina träningspass</strong><span className="small muted">Du väljer vikten första gången. STYRKA anpassar sedan förslagen efter det du registrerar.</span></span>
    </Radio>
    <Radio className="source-option" value="strength_inputs">
      <span className="choice-dot" aria-hidden="true" />
      <span><strong>{profile ? 'Använd även mina styrkeuppgifter' : 'Ange styrkeuppgifter nu'}</strong><span className="small muted">{profile ? 'Dina angivna styrkeuppgifter får också användas i viktförslagen.' : 'Ger underlag för viktförslag redan från första passet.'}</span></span>
    </Radio>
  </RadioGroup>;
}
