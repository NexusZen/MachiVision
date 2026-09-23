import type {Features,Graph,Params} from './model';
import {sensoryDrive,isDrivenInput} from './retina';
export const DYNAMICS_VERSION='fixed-synapse-lif-v4-light';
export const TICK_SECONDS=.0002;
export const LIF={restMv:-52,thresholdMv:-45,resetMv:-52,membraneMs:20,synapseMs:5,refractoryMs:2.2,delayMs:1.8,synapseMv:.275,inputHz:150,inputWeightMv:.275*250};
// Seeds only the reproducible external Poisson process, never physiology.
export function stableHash(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h||1;}
type Wiring={offset:Int32Array;post:Int32Array;count:Float64Array;sign:Float64Array};
const cache=new WeakMap<Graph,Wiring>();
function wiring(g:Graph):Wiring{
 let w=cache.get(g);if(w)return w;
 const ids=new Map(g.neurons.map((n,i)=>[n.neuron_id,i])),offset=new Int32Array(g.neurons.length+1);
 for(const e of g.connections)offset[ids.get(e.pre_neuron)!+1]++;
 for(let i=1;i<offset.length;i++)offset[i]+=offset[i-1];
 const cursor=offset.slice(),post=new Int32Array(g.connections.length),count=new Float64Array(post.length),sign=new Float64Array(post.length);
 for(const e of g.connections){const pre=ids.get(e.pre_neuron)!,k=cursor[pre]++;post[k]=ids.get(e.post_neuron)!;count[k]=e.synapse_count;sign[k]=g.neurons[pre].fast_sign??(g.synthetic?1:0);}
 w={offset,post,count,sign};cache.set(g,w);return w;
}
export type NeuralSnapshot={depolarizationMv:number[];activation:number[];voltageMv:number[];spikeCounts:number[];rateHz:number[];spikeEvents:[number,number][];windowSeconds:number;simulationTimeSeconds:number};
export class SpikingDynamics{
 private voltage:Float64Array;private conductance:Float64Array;private refractory:Int32Array;
 private random:Uint32Array;private pending:number[][]=Array.from({length:10},()=>[]);
 private awake:Uint32Array;private enabled:Uint8Array;private driven:Uint8Array;
 private tick=0;private remainder=0;private edges:Wiring;
 constructor(private graph:Graph,private p:Params){
  if(!Object.values(p).every(Number.isFinite)||p.membraneMs<=5||p.synapseMv<0||p.input<0||p.threshold<0||p.hops<1)throw Error('Invalid LIF simulation parameters');
  const n=graph.neurons.length;this.awake=new Uint32Array(Math.ceil(n/32));this.enabled=Uint8Array.from(graph.neurons,n=>Number(n.depth<p.hops));this.driven=Uint8Array.from(graph.neurons,n=>Number(isDrivenInput(n)));this.voltage=new Float64Array(n).fill(LIF.restMv);this.conductance=new Float64Array(n);this.refractory=new Int32Array(n);
  this.random=Uint32Array.from(graph.neurons,n=>stableHash(n.neuron_id));this.edges=wiring(graph);
 }
 advance(f:Features,dt:number):NeuralSnapshot{
  if(!Number.isFinite(dt)||dt<0||dt>1)throw Error('Sample duration must be between 0 and 1 second');
  const {graph,p,edges}=this,n=graph.neurons.length,counts=new Uint16Array(n),events:[number,number][]=[],depolarization=new Float64Array(n);
  const probability=new Float64Array(n),inputs:number[]=[];
  for(let i=0;i<n;i++)if(this.driven[i]){inputs.push(i);probability[i]=1-Math.exp(-LIF.inputHz*p.input*sensoryDrive(graph.neurons[i],f)*TICK_SECONDS);}
  const m=Math.exp(-TICK_SECONDS/(p.membraneMs/1000)),s=Math.exp(-TICK_SECONDS/.005),coupling=.005/(p.membraneMs/1000-.005)*(m-s);
  this.remainder+=dt;let steps=0;
  while(this.remainder+1e-12>=TICK_SECONDS){
   const delivery=this.pending[this.tick%10];
   for(const pre of delivery)for(let k=edges.offset[pre];k<edges.offset[pre+1];k++)if(edges.count[k]>=p.threshold&&this.enabled[edges.post[k]]){const post=edges.post[k];this.conductance[post]+=edges.count[k]*edges.sign[k]*p.synapseMv;this.awake[post>>>5]|=1<<(post&31);}
   delivery.length=0;
   for(const i of inputs){let x=this.random[i];x^=x<<13;x^=x>>>17;x^=x<<5;this.random[i]=x>>>0;if(this.random[i]/4294967296<probability[i]&&this.enabled[i]){this.voltage[i]+=LIF.inputWeightMv;this.awake[i>>>5]|=1<<(i&31);}}
   // Visit exactly the cells touched by input or synapses, in index order.
   // Untouched cells remain at rest; no epsilon or activity cutoff is used.
   for(let word=0;word<this.awake.length;word++){let bits=this.awake[word];while(bits){const bit=bits&-bits,i=word*32+31-Math.clz32(bit);bits&=bits-1;
    if(this.tick<this.refractory[i])continue;
    if(this.voltage[i]===LIF.restMv&&this.conductance[i]===0)continue;
    this.voltage[i]=LIF.restMv+(this.voltage[i]-LIF.restMv)*m+this.conductance[i]*coupling;this.conductance[i]*=s;
    depolarization[i]+=Math.max(0,Math.min(LIF.thresholdMv,this.voltage[i])-LIF.restMv);
    if(this.voltage[i]>LIF.thresholdMv){
     counts[i]++;events.push([i,(this.tick+1)*TICK_SECONDS]);this.voltage[i]=LIF.resetMv;this.conductance[i]=0;
     this.refractory[i]=this.tick+(this.driven[i]?1:11);
     this.pending[(this.tick+9)%10].push(i);
    }
   }
   }
   this.tick++;steps++;this.remainder=Math.max(0,this.remainder-TICK_SECONDS);
  }
  const seconds=steps*TICK_SECONDS,rateHz=Array.from(counts,c=>seconds?c/seconds:0);
  return {depolarizationMv:Array.from(depolarization,v=>steps?v/steps:0),activation:rateHz.map(r=>Math.min(1,r/150)),voltageMv:Array.from(this.voltage),spikeCounts:Array.from(counts),rateHz,spikeEvents:events,windowSeconds:seconds,simulationTimeSeconds:this.tick*TICK_SECONDS};
 }
}
