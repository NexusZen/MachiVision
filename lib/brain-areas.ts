import type {Neuron} from './model';

// Balanced spatial partitions of actual anchors, not anatomical neuropil labels.
export function brainAreas(neurons:Neuron[], targetSize=55):number[][] {
 if(!neurons.length)return [];
 const partition=(ids:number[], groups:number):number[][]=>{
  if(groups===1)return [ids];
  const spans=[0,1,2].map(axis=>{let lo=Infinity,hi=-Infinity;for(const i of ids){lo=Math.min(lo,neurons[i].position[axis]);hi=Math.max(hi,neurons[i].position[axis]);}return hi-lo;});
  const axis=spans.indexOf(Math.max(...spans));
  ids.sort((a,b)=>neurons[a].position[axis]-neurons[b].position[axis]||a-b);
  const left=Math.floor(groups/2),cut=Math.round(ids.length*left/groups);
  return [...partition(ids.slice(0,cut),left),...partition(ids.slice(cut),groups-left)];
 };
 return partition(neurons.map((_,i)=>i),Math.max(1,Math.round(neurons.length/targetSize)));
}

export function areaActivity(areas:number[][], activation:ArrayLike<number>, visible?:boolean[]):Float32Array {
 return Float32Array.from(areas,ids=>{let peak=0;for(const i of ids)if(!visible||visible[i])peak=Math.max(peak,activation[i]||0);return Math.max(0,Math.min(1,peak));});
}
