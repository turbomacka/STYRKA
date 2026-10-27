import { ENGINE_VERSION, type Exposure, type Recommendation } from '../../src/domain/decision_engine';
import { NOW } from './helpers';
export const base: Recommendation={exerciseId:'bench_press',kg:80,reps:7,sets:3,bandMin:5,bandMax:7,mode:'heavy',state:'normal',reasons:[],engineVersion:ENGINE_VERSION,confidence:'low'};
export function exposure(p=base, actual: Partial<{kg:number;reps:number;rir:number|null;sets:number}>={}, index=0): Exposure {
  return {id:`e${index}`,exerciseId:p.exerciseId,whenUtc:new Date(Date.parse(NOW)+index*72*3600000).toISOString(),complete:(actual.sets??p.sets)>=p.sets,finished:true,plannedSets:p.sets,plannedTargetReps:p.reps,bandMax:p.bandMax,symptom:'none',
    sets:Array.from({length:actual.sets??p.sets},()=>({kind:'work',status:'done',plannedKg:p.kg!,actualKg:actual.kg??p.kg!,plannedReps:p.reps,actualReps:actual.reps??p.reps,rir:actual.rir===undefined?2:actual.rir,technique:'controlled'}))};
}
