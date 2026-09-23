import type {State} from './model';

// A percentage, not a novelty/reward estimate or per-video normalization.
export function activityScore(spiking:number,total:number):number{
 if(!Number.isFinite(spiking)||!Number.isFinite(total)||total<=0)return 0;
 return 100*Math.max(0,Math.min(1,spiking/total));
}
export function peakActivity(frames:State[]):number|null{
 return frames.length?frames.reduce((peak,s)=>Math.max(peak,s.score),0):null;
}
export function formatScore(value:number|null|undefined):string{
 return value==null?'—':value.toFixed(2);
}
