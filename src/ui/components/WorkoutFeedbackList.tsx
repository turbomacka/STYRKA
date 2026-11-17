import { observationLabel, type ExerciseFeedback } from '../../application/workoutExerciseFeedback';

/** One compact row per exercise; sides and equipment stay explicit inside its details. */
export function WorkoutFeedbackList({exercises,planningReady}:{exercises:ExerciseFeedback[];planningReady:boolean}) {
  if(!exercises.length)return null;
  return <section aria-labelledby="workout-exercises-title">
    <h2 id="workout-exercises-title">Ditt pass, övning för övning</h2>
    <ul className="workout-feedback-list">
      {exercises.map(e=><li key={e.exerciseId}>
        <h3>{e.name}{e.added&&<span className="small muted"> · tillagd</span>}</h3>
        <p>{e.headline}</p>
        <details>
          <summary aria-label={`Detaljer och nästa förslag för ${e.name}`}>Detaljer och nästa förslag</summary>
          <div className="workout-feedback-details">
            {e.variants.map((v,index)=><div key={v.key}>
              <h4>{v.label}{e.variants.length>1?` · variant ${index+1}`:''}</h4>
              {v.observations.map(o=><div key={o.side}>
                {e.variants.length>1||v.observations.length>1?<p><strong>{observationLabel(o)}: </strong>{o.headline}</p>:null}
                <p>{v.observations.length===1?`${observationLabel(o)}: `:''}{o.work}</p>
                {o.caution&&<p>{o.caution}</p>}
                {o.previousWork&&<p>Förra jämförbara passet: {o.previousWork}</p>}
                {o.insight?.previousSessionId&&<p className="small muted">Samma utrustning, sida och antal set i jämförelsen.</p>}
                {o.insight?.kind==='target'&&<p className="small muted">Jämförelsen gäller dagens repetitionsmål och belastning, inte ett tidigare pass.</p>}
                {o.insight&&o.comparison==='first'&&<p className="small muted">Det här är en första referens för samma utrustning och sida.</p>}
                {!o.insight&&o.comparison==='uncertain'&&<p className="small muted">Dagens arbete visas utan säker jämförelse med ett tidigare pass.</p>}
              </div>)}
              <p className="feedback-recommendation">{planningReady&&v.recommendation
                ?v.recommendation.recommendation
                :'Nästa rekommendation har ännu inte kunnat beräknas för den här varianten.'}</p>
            </div>)}
          </div>
        </details>
      </li>)}
    </ul>
    {planningReady&&<p className="small muted">Förslagen är preliminära. De räknas om från aktuella uppgifter när du öppnar ett pass.</p>}
  </section>;
}
