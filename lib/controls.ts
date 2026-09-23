import {isDrivenInput} from './retina';
import type {Graph} from './model';
export const controls=['Normal','No input','Disconnected inputs','Shuffled wiring','Mirrored image'] as const;
export type Control=typeof controls[number];
export const SHUFFLE_SEED=20260922;
export function controlGraph(graph:Graph,control:Control):Graph{
 if(control==='Disconnected inputs'){
  const inputs=new Set(graph.neurons.filter(n=>graph.fullModel?['R1-6','R7','R8'].includes(n.cell_type||''):isDrivenInput(n)).map(n=>n.neuron_id));
  return {...graph,connections:graph.connections.filter(e=>!inputs.has(e.pre_neuron))};
 }
 if(control!=='Shuffled wiring'||graph.fullModel)return graph;
 const posts=graph.connections.map(e=>e.post_neuron);let seed=SHUFFLE_SEED;
 for(let i=posts.length-1;i>0;i--){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const j=(seed>>>0)%(i+1);[posts[i],posts[j]]=[posts[j],posts[i]];}
 return {...graph,connections:graph.connections.map((e,i)=>({...e,post_neuron:posts[i]}))};
}
export function controlPixels(pixels:Uint8ClampedArray,w:number,h:number,control:Control){
 if(control==='No input')return new Uint8ClampedArray(pixels.length);
 if(control!=='Mirrored image')return pixels;
 const result=new Uint8ClampedArray(pixels.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)result.set(pixels.subarray((y*w+x)*4,(y*w+x)*4+4),(y*w+w-1-x)*4);
 return result;
}
