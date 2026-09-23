import {activityScore} from './activity-score';
import type {Features,Graph,Params,State} from './model';
import type {Control} from './controls';
import {SHUFFLE_SEED} from './controls';

export const FULL_DYNAMICS_VERSION='full-photoreceptor-lif-v1';
export type FullManifest={version:string;modelId:string;baseUrl:string;neurons:number;connections:number;connectionsAtFive:number;photoreceptors:number;mappedPhotoreceptors:number;dopamineNeurons:number;files:Record<string,{sha256:string;bytes:number}>};
// ID, cell type, superclass, transmitter sign, screen u/v, dopamine annotation.
export type FullNode=[string,number,number,number,number,number,number];
export type FullData={types:string[];regions:string[];nodes:FullNode[];offsets:Uint32Array;posts:Uint32Array;counts:Float32Array};
export type CircuitMeasurement={neurons:number;spiking:number;spikes:number;meanRateHz:number;meanDepolarizationMv:number};
const models=new Map<string,Promise<FullData>>();
export function loadFullModel(manifest:FullManifest):Promise<FullData>{
 let pending=models.get(manifest.modelId);if(pending)return pending;
 pending=(async()=>{
  const get=async(name:string)=>{
   const response=await fetch(`${manifest.baseUrl}/${name}`);if(!response.ok)throw Error(`Full connectome asset unavailable: ${name}`);
   const bytes=await response.arrayBuffer(),expected=manifest.files[name];
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(bytes.byteLength!==expected.bytes||digest!==expected.sha256)throw Error(`Full connectome integrity check failed: ${name}`);
   return bytes;
  };
  const [metadata,offsets,posts,counts]=await Promise.all(['neurons.json','offsets.bin','posts.bin','counts.bin'].map(get));
  const data:FullData={...JSON.parse(new TextDecoder().decode(metadata)),offsets:new Uint32Array(offsets),posts:new Uint32Array(posts),counts:new Float32Array(counts)};
  if(data.nodes.length!==manifest.neurons||data.posts.length!==manifest.connections||data.counts.length!==data.posts.length||data.offsets.length!==data.nodes.length+1||data.offsets.at(-1)!==data.posts.length)throw Error('Invalid full-connectome dimensions');
  return data;
 })();
 models.set(manifest.modelId,pending);pending.catch(()=>models.delete(manifest.modelId));return pending;
}

// Linear RGB luminance only: monitor pixels cannot supply the fly's UV spectrum.
export function luminancePlane(pixels:Uint8ClampedArray):Float32Array{
 const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 const result=new Float32Array(pixels.length/4);
 for(let i=0;i<result.length;i++)result[i]=.2126*linear(pixels[i*4]/255)+.7152*linear(pixels[i*4+1]/255)+.0722*linear(pixels[i*4+2]/255);
 return result;
}
export function sampleLight(light:Float32Array,w:number,h:number,u:number,v:number){
 if(u<0||v<0)return 0;
 const x=Math.max(0,Math.min(w-1,u*(w-1))),y=Math.max(0,Math.min(h-1,v*(h-1))),xx=Math.floor(x),yy=Math.floor(y),dx=x-xx,dy=y-yy;
 const at=(a:number,b:number)=>light[Math.min(h-1,b)*w+Math.min(w-1,a)];
 return (1-dy)*((1-dx)*at(xx,yy)+dx*at(xx+1,yy))+dy*((1-dx)*at(xx,yy+1)+dx*at(xx+1,yy+1));
}
export const circuitNames=['R1-6','R7','R8','L1','L2','L3','L4','L5','Mi1','Tm1','T4','T5','LC4','Dopamine'];
const DT=.0002,REST=-52,THRESHOLD=-45;
/** Fixed-wiring LIF hypothesis, not measured fly physiology. No feature injection.
 * Photoreceptor light drive and tonic lamina bias are explicit model assumptions.
 * No plasticity, novelty reward, scrolling policy, or recurrent-weight adaptation.
 */
export class FullSimulator{
 private voltage:Float64Array;private conductance:Float64Array;private refractory:Int32Array;
 private awake:Uint32Array;private pending:number[][]=Array.from({length:10},()=>[]);
 private receptors:number[]=[];private lamina:number[]=[];private filtered:Float64Array;
 private display:Int32Array;private reverseDisplay:Int32Array;private post:Uint32Array;
 private mp:Float64Array;private sp:Float64Array;private msum:Float64Array;private ssum:Float64Array;private updated:Int32Array;private signs:Float64Array;private circuitIds:Int16Array;private tick=0;private remainder=0;
 constructor(private data:FullData,displayGraph:Graph,private params:Params,private control:Control='Normal',private passiveIntegration=false){
  if(!Object.values(params).every(Number.isFinite)||params.membraneMs<=5||params.synapseMv<0||params.input<0||params.threshold<0)throw Error('Invalid simulation parameters');
  const n=data.nodes.length;
  const m=Math.exp(-DT/(params.membraneMs/1000)),s=Math.exp(-DT/.005);
  this.mp=Float64Array.from({length:5001},(_,i)=>m**i);this.sp=Float64Array.from({length:5001},(_,i)=>s**i);
  this.msum=Float64Array.from(this.mp,v=>m*(1-v)/(1-m));this.ssum=Float64Array.from(this.sp,v=>s*(1-v)/(1-s));
  this.updated=new Int32Array(n);this.voltage=new Float64Array(n).fill(REST);this.conductance=new Float64Array(n);this.refractory=new Int32Array(n);this.awake=new Uint32Array(Math.ceil(n/32));
  const ids=new Map(data.nodes.map((node,i)=>[node[0],i]));
  this.display=Int32Array.from(displayGraph.neurons,node=>ids.get(node.neuron_id)??-1);
  if(this.display.some(i=>i<0))throw Error('Display neuron missing from full connectome');
  this.reverseDisplay=new Int32Array(n).fill(-1);this.display.forEach((i,d)=>this.reverseDisplay[i]=d);
  this.circuitIds=new Int16Array(n).fill(-1);this.signs=Float64Array.from(data.nodes,node=>node[3]*params.synapseMv);
  data.nodes.forEach((node,i)=>{
   const type=data.types[node[1]];
   if(control==='Disconnected inputs'&&['R1-6','R7','R8'].includes(type))this.signs[i]=0;
   if(['R1-6','R7','R8'].includes(type)&&node[4]>=0&&node[5]>=0)this.receptors.push(i);
   if(/^L[1-5]$/.test(type))this.lamina.push(i);
   this.circuitIds[i]=circuitNames.indexOf(node[6]?'Dopamine':/^T4[abcd]$/.test(type)?'T4':/^T5[abcd]$/.test(type)?'T5':type);
  });
  this.filtered=new Float64Array(this.receptors.length);this.post=data.posts;
  if(control==='Shuffled wiring'){
   this.post=data.posts.slice();let seed=SHUFFLE_SEED;
   for(let i=this.post.length-1;i>0;i--){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const j=(seed>>>0)%(i+1);const a=this.post[i];this.post[i]=this.post[j];this.post[j]=a;}
  }
 }
 // Integrate guaranteed-subthreshold cells analytically between synaptic events.
 // This skips work, not small signals: no activity cutoff or discarded currents.
 private settle(i:number,until:number,depol:Float64Array,m:number,s:number,factor:number){
  const steps=until-Math.max(this.updated[i],this.refractory[i]);this.updated[i]=until;
  if(steps<=0)return;
  const v=this.voltage[i]-REST,g=this.conductance[i];if(v===0&&g===0)return;
  const a=v+g*factor,b=-g*factor,mp=this.mp[steps],sp=this.sp[steps];
  // a*m^j + b*s^j changes sign at most once. Sum only positive samples.
  const value=(j:number)=>a*this.mp[j]+b*this.sp[j];
  let lo=1,hi=steps;
  const first=value(lo)>0,last=value(hi)>0;
  if(first!==last){let left=lo,right=hi;while(left<right){const mid=(left+right)>>>1;if((value(mid)>0)===first)left=mid+1;else right=mid;}if(first)hi=left-1;else lo=left;}
  if(first||last){depol[i]+=Math.max(0,a*(this.msum[hi]-this.msum[lo-1])+b*(this.ssum[hi]-this.ssum[lo-1]));}
  this.voltage[i]=REST+a*mp+b*sp;this.conductance[i]=g*sp;
 }
 step(pixels:Uint8ClampedArray,w:number,h:number,f:Features,dt=.05):State{
  if(!Number.isFinite(dt)||dt<0||dt>1)throw Error('Sample duration must be between 0 and 1 second');
  const {data,params}=this,n=data.nodes.length,counts=new Uint16Array(n),depol=new Float64Array(n),events:[number,number][]=[];
  const light=luminancePlane(pixels),targets=Float64Array.from(this.receptors,i=>this.control==='No input'?0:sampleLight(light,w,h,data.nodes[i][4],data.nodes[i][5]));
  const m=Math.exp(-DT/(params.membraneMs/1000)),s=Math.exp(-DT/.005),coupling=.005/(params.membraneMs/1000-.005)*(m-s),photoDecay=Math.exp(-DT/.01);
  const drive=new Float64Array(n);
  for(const i of this.lamina){drive[i]=12;this.awake[i>>>5]|=1<<(i&31);}
  this.remainder+=dt;let steps=0;
  while(this.remainder+1e-12>=DT){
   const delivery=this.pending[this.tick%10];
   for(const pre of delivery){
    const sign=this.signs[pre];if(!sign)continue;
    for(let k=data.offsets[pre];k<data.offsets[pre+1];k++)if(data.counts[k]>=params.threshold){const post=this.post[k];if(this.passiveIntegration&&!(this.awake[post>>>5]&(1<<(post&31))))this.settle(post,this.tick,depol,m,s,.005/(params.membraneMs/1000-.005));this.conductance[post]+=data.counts[k]*sign;this.awake[post>>>5]|=1<<(post&31);}
   }
   delivery.length=0;
   for(let r=0;r<this.receptors.length;r++){
    const i=this.receptors[r];this.filtered[r]=photoDecay*this.filtered[r]+(1-photoDecay)*targets[r];
    drive[i]=params.input*30*this.filtered[r]/(.02+this.filtered[r]);
    if(drive[i])this.awake[i>>>5]|=1<<(i&31);
   }
   for(let word=0;word<this.awake.length;word++){let bits=this.awake[word];while(bits){
    const bit=bits&-bits,i=word*32+31-Math.clz32(bit);bits&=bits-1;
    this.updated[i]=this.tick+1;
    if(this.tick<this.refractory[i])continue;
    this.voltage[i]=REST+(this.voltage[i]-REST)*m+this.conductance[i]*coupling+drive[i]*(1-m);this.conductance[i]*=s;
    depol[i]+=Math.max(0,Math.min(THRESHOLD,this.voltage[i])-REST);
    if(this.voltage[i]>THRESHOLD){
     counts[i]++;const display=this.reverseDisplay[i];if(display>=0)events.push([display,(this.tick+1)*DT]);
     this.voltage[i]=REST;this.conductance[i]=0;this.refractory[i]=this.tick+11;this.pending[(this.tick+9)%10].push(i);
    }
    if(this.passiveIntegration&&!drive[i]&&this.voltage[i]<=REST&&this.conductance[i]<=0)this.awake[word]&=~bit;
   }}
   this.tick++;steps++;this.remainder=Math.max(0,this.remainder-DT);
  }
  if(this.passiveIntegration)for(let i=0;i<n;i++)if(this.updated[i]<this.tick)this.settle(i,this.tick,depol,m,s,.005/(params.membraneMs/1000-.005));
  const seconds=steps*DT,circuits:Record<string,CircuitMeasurement>={},regions:Record<string,number>={},regionCounts:Record<string,number>={};
  for(const name of circuitNames)circuits[name]={neurons:0,spiking:0,spikes:0,meanRateHz:0,meanDepolarizationMv:0};
  let active=0,totalSpikes=0,daCount=0,daDepol=0,daSpikes=0;
  for(let i=0;i<n;i++){
   const node=data.nodes[i],spikes=counts[i],mean=steps?depol[i]/steps:0,region=data.regions[node[2]]||'Unavailable';
   active+=Number(spikes>0);totalSpikes+=spikes;
   regions[region]=(regions[region]||0)+(seconds?Math.min(1,spikes/seconds/150):0);regionCounts[region]=(regionCounts[region]||0)+1;
   if(node[6]){daCount++;daDepol+=mean;daSpikes+=spikes;}
   const group=this.circuitIds[i];if(group>=0){const c=circuits[circuitNames[group]];c.neurons++;c.spiking+=Number(spikes>0);c.spikes+=spikes;c.meanDepolarizationMv+=mean;}
  }
  for(const c of Object.values(circuits)){c.meanDepolarizationMv/=c.neurons||1;c.meanRateHz=seconds?c.spikes/(c.neurons||1)/seconds:0;}
  for(const key of Object.keys(regions))regions[key]/=regionCounts[key];
  const rateHz=Array.from(this.display,i=>seconds?counts[i]/seconds:0);
  return {features:f,activation:rateHz.map(r=>Math.min(1,r/150)),rateHz,voltageMv:Array.from(this.display,i=>this.voltage[i]),spikeCounts:Array.from(this.display,i=>counts[i]),depolarizationMv:Array.from(this.display,i=>steps?depol[i]/steps:0),spikeEvents:events,simulationTimeSeconds:this.tick*DT,windowSeconds:seconds,active,networkMeanRateHz:seconds?totalSpikes/n/seconds:0,simulatedNeurons:n,circuits,dopamineRaw:daCount?daDepol/daCount:null,dopamineRateHz:daCount&&seconds?daSpikes/daCount/seconds:0,score:activityScore(active,n),components:{},regions,trigger:'Mapped photoreceptor luminance; fixed recurrent connectivity'};
 }
}
