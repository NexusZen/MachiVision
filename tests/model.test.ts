import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoGraph,Simulator,defaults,trace,features} from '../lib/model';
import {referenceFeatures} from '../lib/response-calibration';
const base=demoGraph(),f=referenceFeatures('Combined visual drive',20),blank=referenceFeatures('Blank baseline',0);
const fixture=(sign=1)=>({...base,neurons:base.neurons.slice(0,2).map((n,i)=>({...n,depth:i,fast_sign:sign})),connections:[{pre_neuron:base.neurons[0].neuron_id,post_neuron:base.neurons[1].neuron_id,synapse_count:1000,normalized_weight:.00001}]});
test('counts and rates reflect actual events, not display thresholds',()=>{
 const g=fixture(),before=JSON.stringify(g),s=new Simulator(g,defaults).step(f);
 assert(s.active>0);assert.equal(s.active,s.spikeCounts!.filter(n=>n>0).length);
 s.spikeCounts!.forEach((n,i)=>{assert.equal(n,s.spikeEvents!.filter(e=>e[0]===i).length);assert.equal(s.rateHz![i],n/s.windowSeconds!);});
 assert.equal(JSON.stringify(g),before);
});
test('synaptic delay, signed raw counts, threshold and refractory period',()=>{
 const sim=new Simulator(fixture(),defaults);let first=-1;
 for(let t=0;t<500;t++){const s=sim.step(f,.0002);if(first<0&&s.spikeCounts![0])first=t;if(first>=0&&t<first+9)assert.equal(s.voltageMv![1],-52);}
 assert(first>=0);
 const excite=new Simulator(fixture(),defaults).step(f,.2),inhibit=new Simulator(fixture(-1),defaults).step(f,.2);
 assert(excite.spikeCounts![1]>0);assert.equal(inhibit.spikeCounts![1],0);assert(inhibit.voltageMv![1]<-52);
 assert.equal(new Simulator(fixture(),{...defaults,threshold:1001}).step(f,.2).spikeCounts![1],0);
 const times=excite.spikeEvents!.filter(e=>e[0]===1).map(e=>e[1]);
 for(let i=1;i<times.length;i++)assert(times[i]-times[i-1]>=.0022-1e-10);
});
test('chunking preserves spikes and voltages; input seeds follow neuron identity',()=>{
 const g=fixture(),a=new Simulator(g,defaults),b=new Simulator(g,defaults),events:number[][]=[];
 for(let i=0;i<20;i++)events.push(...a.step(f,.005).spikeEvents!);
 const whole=b.step(f,.1);assert.deepEqual(events,whole.spikeEvents);assert.deepEqual(a.step(f,0).voltageMv,whole.voltageMv);
 assert.deepEqual(new Simulator(g,defaults).step(f),new Simulator(g,defaults).step(f));
 const rev={...g,neurons:[...g.neurons].reverse()};
 assert.deepEqual(new Simulator(rev,defaults).step(f).spikeCounts!.reverse(),new Simulator(g,defaults).step(f).spikeCounts);
});
test('blank input is silent; resetting clears pending spikes',()=>{
 const g=fixture(),sim=new Simulator(g,defaults);sim.step(f);
 assert.equal(new Simulator(g,defaults).step(blank,.2).active,0);
 for(let i=0;i<20;i++)sim.step(blank);assert.equal(sim.step(blank).active,0);
});
test('paths use graph edges and black frames produce no cues',()=>{
 const path=trace(base,'demo-0-4-0');assert.equal(path.length,5);
 for(let i=1;i<path.length;i++)assert(base.connections.some(e=>e.pre_neuron===path[i-1]&&e.post_neuron===path[i]));
 const black=new Uint8ClampedArray(128*80*4);assert.equal(features(black,black,128,80,0).motion_magnitude,0);
});
