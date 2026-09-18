export type Neuron={neuron_id:string;cell_type:string|null;brain_region:string;super_class?:string;input_feature?:string|null;hemisphere:string;neurotransmitter:string|null;fast_sign?:number;position:number[];depth:number;annotation_source:string;skeleton_reference:string|null;morphology_reference:string|null};
export type Edge={pre_neuron:string;post_neuron:string;synapse_count:number;normalized_weight:number};
export type ResponseCalibration={version:string;graphId:string;parameters:Params;baseline:number;reference:number;references:{name:string;peak:number}[]};
export type Graph={source:string;synthetic:boolean;modelId?:string;responseCalibration?:ResponseCalibration;neurons:Neuron[];connections:Edge[]};
export type Features={timestamp:number;luminance:number;contrast:number;temporal_change:number;motion_x:number;motion_y:number;motion_magnitude:number;looming:number;flicker:number;left_field_activity:number;right_field_activity:number;scene_change:number;edge_density:number};
export type Params={decay:number;gain:number;input:number;threshold:number;hops:number};
export const defaults:Params={decay:.65,gain:.65,input:1,threshold:5,hops:6};
export const weights={visual:.20,motion:.20,contrast:.10,network:.15,downstream:.15,looming:.10,novelty:.10};
export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export function demoGraph():Graph {
 const neurons:Neuron[]=[],connections:Edge[]=[];
 for(let h=0;h<2;h++)for(let d=0;d<5;d++)for(let i=0;i<42;i++){
 const a=i*2.399963, r=Math.sqrt((i+.5)/42), side=h?1:-1;
 neurons.push({neuron_id:`demo-${h}-${d}-${i}`,cell_type:`Synthetic population ${d+1}`,brain_region:['Visual input','Optic processing','Visual projection','Central network','Downstream network'][d],hemisphere:h?'Right':'Left',neurotransmitter:null,position:[side*(3.2-d*.55)+Math.cos(a)*r*(d<2?.85:1.05),Math.sin(a)*r*(1.65-d*.15)+.25*Math.sin(d),Math.sin(i*1.7+d)*.65],depth:d,annotation_source:'Synthetic demonstration; not an annotated biological neuron',skeleton_reference:null,morphology_reference:null});
 if(d>0)for(let k=0;k<3;k++)connections.push({pre_neuron:`demo-${h}-${d-1}-${(i+k*7)%42}`,post_neuron:`demo-${h}-${d}-${i}`,synapse_count:8+k*4,normalized_weight:1/3});
 }return {source:'DEMO CONNECTOME',synthetic:true,neurons,connections};
}
export function features(p:Uint8ClampedArray,prev:Uint8ClampedArray|null,w:number,h:number,t:number):Features{
 const n=w*h,g=new Float32Array(n),old=new Float32Array(n);let sum=0,sq=0,diff=0,left=0,right=0,edge=0;
 for(let i=0;i<n;i++){g[i]=(p[i*4]*.299+p[i*4+1]*.587+p[i*4+2]*.114)/255;old[i]=prev?(prev[i*4]*.299+prev[i*4+1]*.587+prev[i*4+2]*.114)/255:g[i];sum+=g[i];sq+=g[i]*g[i];const d=Math.abs(g[i]-old[i]);diff+=d;if(i%w<w/2)left+=d;else right+=d;if(i%w&&Math.abs(g[i]-g[i-1])>.12)edge++;}
 let vx=0,vy=0,expansion=0,count=0;
 if(prev)for(let y=8;y<h-8;y+=12)for(let x=8;x<w-8;x+=12){let best=Infinity,bx=0,by=0,base=0;for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++)base+=Math.abs(g[(y+yy)*w+x+xx]-old[(y+yy)*w+x+xx]);for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2){let err=0;for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++)err+=Math.abs(g[(y+yy)*w+x+xx]-old[(y+yy-dy)*w+x+xx-dx]);if(err<best){best=err;bx=dx;by=dy;}}if(base>best+.15){vx+=bx;vy+=by;expansion+=(bx*(x-w/2)+by*(y-h/2))/(w*h*.02);count++;}}
 return {timestamp:t,luminance:sum/n,contrast:clamp(Math.sqrt(Math.max(0,sq/n-(sum/n)**2))*3),temporal_change:clamp(diff/n*5),motion_x:count?vx/count/4:0,motion_y:count?vy/count/4:0,motion_magnitude:clamp(count?Math.hypot(vx/count,vy/count)/4+count/100:0),looming:clamp(count?expansion/count:0),flicker:clamp(Math.abs(sum/n-old.reduce((a,b)=>a+b,0)/n)*5),left_field_activity:clamp(left/n*10),right_field_activity:clamp(right/n*10),scene_change:clamp(diff/n*2),edge_density:edge/n};
}
export type State={dopamine?:number|null;dopamineRaw?:number|null;features:Features;activation:number[];score:number;components:Record<string,number>;regions:Record<string,number>;active:number;trigger:string};
const topologyCache=new WeakMap<Graph,{pre:Int32Array;post:Int32Array;weight:Float64Array;count:Float64Array}>();
function topology(graph:Graph){let cached=topologyCache.get(graph);if(!cached){const index=new Map(graph.neurons.map((n,i)=>[n.neuron_id,i]));cached={pre:Int32Array.from(graph.connections,e=>index.get(e.pre_neuron)!),post:Int32Array.from(graph.connections,e=>index.get(e.post_neuron)!),weight:Float64Array.from(graph.connections,e=>e.normalized_weight*(graph.neurons[index.get(e.pre_neuron)!].fast_sign??1)),count:Float64Array.from(graph.connections,e=>e.synapse_count)};topologyCache.set(graph,cached);}return cached;}
export function simulate(f:Features,previous:number[],graph:Graph,p:Params,dt=.05):State{
 // Recurrent drive is part of the leaky update, not added on top of retained
 // activity. With incoming weight sums <= 1 and gain < 1, silence contracts.
 if(p.gain<0||p.gain>=1||p.decay<0||p.decay>=1)throw new Error('Decay and recurrent gain must be between 0 and 1 (exclusive upper bound).');
 const retention=p.decay**(Math.max(0,dt)/.05),leak=1-retention;
 const edges=topology(graph),incoming=new Float32Array(graph.neurons.length);
 for(let i=0;i<edges.pre.length;i++)if(edges.count[i]>=p.threshold)incoming[edges.post[i]]+=(previous[edges.pre[i]]||0)*edges.weight[i];
 const activation=graph.neurons.map((n,i)=>{const drive=n.input_feature==='looming'?f.looming*.8+f.temporal_change*.1:n.input_feature==='motion'?f.motion_magnitude*.65+f.contrast*.1+f.temporal_change*.25:f.contrast*.12+f.motion_magnitude*.45+f.looming*.45+f.temporal_change*.3;return n.depth>=p.hops?0:clamp((previous[i]||0)*retention+leak*p.gain*incoming[i]+(n.depth===0?leak/(1-p.decay)*p.input*drive*(n.hemisphere.toLowerCase()==='left'?.7+.3*f.left_field_activity:.7+.3*f.right_field_activity):0));});
 const group=(n:Neuron)=>graph.synthetic?n.brain_region:n.super_class||'Unavailable';
 const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/(v.length||1),regions:Record<string,number>={};for(const n of graph.neurons)regions[group(n)]=0;
 for(const r of Object.keys(regions))regions[r]=mean(activation.filter((_,i)=>group(graph.neurons[i])===r));
 const components={visual:mean(activation.filter((_,i)=>graph.neurons[i].depth===0)),motion:f.motion_magnitude,contrast:f.contrast,network:activation.filter(a=>a>.2).length/activation.length,downstream:mean(activation.filter((_,i)=>graph.synthetic?graph.neurons[i].depth===4:['descending','motor'].includes(graph.neurons[i].super_class||''))),looming:f.looming,novelty:f.temporal_change};
 const score=100*Object.entries(weights).reduce((s,[k,w])=>s+components[k as keyof typeof components]*w,0);
 return {features:f,activation,score,components,regions,active:activation.filter(a=>a>.2).length,trigger:f.looming>.3?'Object expansion':f.motion_magnitude>.25?(f.motion_x<0?'Leftward motion':'Rightward motion'):f.flicker>.2?'Rapid luminance change':f.scene_change>.3?'Scene transition':'Contrast structure'};
}
export function trace(graph:Graph,id:string):string[]{
 const nodes=new Map(graph.neurons.map(n=>[n.neuron_id,n])),reverse=new Map<string,string[]>();
 for(const e of graph.connections){const parents=reverse.get(e.post_neuron)||[];parents.push(e.pre_neuron);reverse.set(e.post_neuron,parents);}
 const queue=[[id]],seen=new Set([id]);let head=0;
 while(head<queue.length){const path=queue[head++];if(nodes.get(path[0])?.depth===0)return path;for(const parent of reverse.get(path[0])||[])if(!seen.has(parent)){seen.add(parent);queue.push([parent,...path]);}}return [];
}
export const presets=['Looming object','Moving black dot','Moving white dot','Leftward motion','Rightward motion','Horizontal grating','Vertical grating','Rotating panorama','Flashing light','Approaching object','Receding object','Checkerboard','Scene transition','Natural landscape','Football motion'];
export function drawStimulus(ctx:CanvasRenderingContext2D,w:number,h:number,t:number,kind:string){
 ctx.save();ctx.scale(w/128,h/80);w=128;h=80;
 ctx.fillStyle='#c8d5cb';ctx.fillRect(0,0,w,h);const phase=t%4;
 if(kind.includes('grating')||kind==='Rotating panorama'||kind==='Checkerboard'){for(let y=-h;y<h*2;y+=24)for(let x=-w;x<w*2;x+=24){ctx.fillStyle=((x+y)/24)%2?'#172d2b':'#dce5d9';if(kind==='Horizontal grating')ctx.fillRect(0,y+(t*28)%48,w,12);else if(kind==='Checkerboard')ctx.fillRect(x+Math.floor(t*3)%2*24,y,24,24);else ctx.fillRect(x+(t*28)%48,0,12,h);}}
 else if(kind==='Flashing light'||kind==='Scene transition'){ctx.fillStyle=Math.floor(t*(kind==='Flashing light'?4:.5))%2?'#eff5dd':'#152627';ctx.fillRect(0,0,w,h);}
 else if(kind==='Natural landscape'||kind==='Football motion'){ctx.fillStyle=kind==='Football motion'?'#466b46':'#aec8c6';ctx.fillRect(0,0,w,h);ctx.fillStyle='#294d43';for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(i*w/5-80,h);ctx.lineTo(i*w/5+20,30+Math.sin(i)*30);ctx.lineTo(i*w/5+140,h);ctx.fill();}if(kind==='Football motion'){ctx.strokeStyle='#cbd7b5';ctx.strokeRect(20,20,w-40,h-40);ctx.beginPath();ctx.arc(w/2,h/2,h/3,0,Math.PI*2);ctx.stroke();ctx.fillStyle='white';ctx.beginPath();ctx.arc(w*.5+Math.sin(t*2)*w*.35,h*.5+Math.cos(t)*h*.3,9+phase*3,0,Math.PI*2);ctx.fill();}}
 else {let x=w/2,r=12;if(kind.includes('ooming')||kind==='Approaching object')r=5+Math.pow(phase/4,2)*h*.8;else if(kind==='Receding object')r=5+Math.pow(1-phase/4,2)*h*.8;else x=kind==='Leftward motion'?w-(t*65)%w:(t*65)%w;ctx.fillStyle=kind==='Moving white dot'?'#fff':'#142426';ctx.beginPath();ctx.arc(x,h/2,r,0,Math.PI*2);ctx.fill();}ctx.restore();
}
