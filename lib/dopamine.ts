import type {Graph,State} from './model';

export function formatDopamine(value:number|null|undefined):string{
 if(value==null)return 'N/A';
 if(value>0&&value<.001)return '<0.001';
 return value.toFixed(value>0&&value<.1?3:1);
}

export function dopamineIndices(graph:Graph):number[]{
 return graph.neurons.flatMap((n,i)=>(n.neurotransmitter||'').toLowerCase().split(/[;,]/).some(s=>['dopamine','da'].includes(s.trim()))?[i]:[]);
}
export function dopamineActivity(activation:ArrayLike<number>,indices:number[]):number|null{
 if(!indices.length)return null;
 return 100*indices.reduce((sum,i)=>sum+Math.max(0,Math.min(1,activation[i]||0)),0)/indices.length;
}
export function dopamineHigh(frames:State[]):number|null{
 const available=frames.flatMap(f=>f.dopamine==null?[]:[f.dopamine]);
 return available.length?available.reduce((peak,value)=>Math.max(peak,value),0):null;
}
export function measureDopamine(state:State,indices:number[]){
 state.dopamineRaw=indices.length&&state.depolarizationMv?indices.reduce((sum,i)=>sum+state.depolarizationMv![i],0)/indices.length:null;
 state.dopamineRateHz=indices.length&&state.rateHz?indices.reduce((sum,i)=>sum+state.rateHz![i],0)/indices.length:null;
 delete state.dopamine;
}
export function peakMembrane(frames:State[]):number|null{
 const values=frames.flatMap(s=>s.dopamineRaw==null?[]:[s.dopamineRaw]);
 return values.length?Math.max(...values):null;
}
export function formatResponse(value:number|null|undefined){
 return value==null?'N/A':value===0?'0':value<.001?value.toExponential(2):value.toFixed(3);
}
