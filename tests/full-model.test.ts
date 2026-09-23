import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FullSimulator,FullData,luminancePlane,sampleLight} from '../lib/full-model';
import {demoGraph,defaults,features} from '../lib/model';

function fixture(){
 const graph=demoGraph();graph.neurons=graph.neurons.slice(0,3);graph.connections=[];
 const data:FullData={types:['R1-6','L2','T4a'],regions:['optic'],nodes:graph.neurons.map((n,i)=>[n.neuron_id,i,0,i===0?-1:1,.5,.5,0]),offsets:new Uint32Array([0,1,2,2]),posts:new Uint32Array([1,2]),counts:new Float32Array([60,60])};
 return {graph,data};
}
test('linear luminance and bilinear mapping have defined dark/unmapped behavior',()=>{
 const values=luminancePlane(new Uint8ClampedArray([0,0,0,255,255,255,255,255]));
 assert.equal(values[0],0);assert.equal(values[1],1);assert.equal(sampleLight(values,2,1,.5,0),.5);assert.equal(sampleLight(values,2,1,-1,0),0);
});
test('photo input propagates through signed wiring; disconnection preserves receptor responses but removes their inhibition',()=>{
 const {graph,data}=fixture(),pixels=new Uint8ClampedArray(16).fill(255),f=features(pixels,null,2,2,0),p={...defaults,threshold:1};
 const normal=new FullSimulator(data,graph,p),cut=new FullSimulator(data,graph,p,'Disconnected inputs');
 let a=normal.step(pixels,2,2,f),b=cut.step(pixels,2,2,f);
 for(let i=0;i<5;i++){a=normal.step(pixels,2,2,f);b=cut.step(pixels,2,2,f);}
 assert(a.circuits!['R1-6'].spikes>0);assert.equal(a.circuits!['R1-6'].spikes,b.circuits!['R1-6'].spikes);
 assert(a.circuits!.L2.spikes<b.circuits!.L2.spikes);
 assert.equal(a.active,a.spikeCounts!.filter(x=>x>0).length);
 assert.deepEqual(Array.from(data.counts),[60,60]);
});
test('all model neurons contribute to aggregates even when the display is sampled; features cannot directly drive T4',()=>{
 const {graph,data}=fixture();graph.neurons=graph.neurons.slice(0,1);
 const pixels=new Uint8ClampedArray(16),f=features(pixels,null,2,2,0),p={...defaults,threshold:1};
 const a=new FullSimulator(data,graph,p).step(pixels,2,2,f);
 const b=new FullSimulator(data,graph,p).step(pixels,2,2,{...f,looming:1,motion_x:1,motion_magnitude:1,contrast:1});
 assert(Math.abs(a.score-100*a.active/3)<1e-12);assert.equal(a.score,b.score);
 assert.equal(a.activation.length,1);assert.equal(a.simulatedNeurons,3);assert.equal(a.circuits!.T4.neurons,1);
 assert.deepEqual(a.circuits,b.circuits);assert(a.networkMeanRateHz!>0);assert.equal(a.circuits!['R1-6'].spikes,0);
});
test('unmapped receptors receive no image drive and resets reproduce observations',()=>{
 const {graph,data}=fixture();data.nodes[0][4]=-1;data.nodes[0][5]=-1;
 const pixels=new Uint8ClampedArray(16).fill(255),f=features(pixels,null,2,2,0);
 const a=new FullSimulator(data,graph,defaults).step(pixels,2,2,f),b=new FullSimulator(data,graph,defaults).step(pixels,2,2,f);
 assert.equal(a.circuits!['R1-6'].spikes,0);assert.deepEqual(a,b);
});
 test('analytic passive integration matches tick-by-tick integration across stimulus changes and delays',()=>{
  const {graph,data}=fixture();data.counts[0]=4;data.counts[1]=12;
  const p={...defaults,threshold:1};
  const fast=new FullSimulator(data,graph,p,'Normal',true),reference=new FullSimulator(data,graph,p,'Normal',false);
  for(let frame=0;frame<24;frame++){
   const pixels=new Uint8ClampedArray(16).fill(frame%7<3?220:0),f=features(pixels,null,2,2,frame/20);
   const a=fast.step(pixels,2,2,f),b=reference.step(pixels,2,2,f);
   assert.deepEqual(a.spikeCounts,b.spikeCounts);assert.deepEqual(a.spikeEvents,b.spikeEvents);
   a.voltageMv!.forEach((v,i)=>assert(Math.abs(v-b.voltageMv![i])<1e-9));
   a.depolarizationMv!.forEach((v,i)=>assert(Math.abs(v-b.depolarizationMv![i])<1e-9));
  }
 });
