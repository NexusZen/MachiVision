import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoGraph,defaults,features,Simulator} from '../lib/model';
import {Retina} from '../lib/retina';
import {measureDopamine} from '../lib/dopamine';
import {referenceFeatures,scoreDopamine,CALIBRATION_VERSION} from '../lib/response-calibration';
test('a uniform flash activates mapped ON/OFF cells without inventing directional motion',()=>{
 const base=demoGraph(),g={...base,neurons:base.neurons.slice(0,2).map((n,i)=>({...n,cell_type:i?'Tm1':'Mi1',depth:1,visual_column:{u:.25,v:.5,p:0,q:0,column_id:1,source:'test'}})),connections:[]};
 const black=new Uint8ClampedArray(128*80*4),white=new Uint8ClampedArray(128*80*4).fill(255),retina=new Retina(),sim=new Simulator(g,defaults);
 retina.frame(black,128,80,.05);
 const on=features(white,black,128,80,.05);on.retina=retina.frame(white,128,80,.05);
 assert.equal(on.motion_magnitude,0);assert(Math.max(...on.retina.on.flat(),...on.retina.off.flat())<1e-12);
 const response=sim.step(on);assert(response.spikeCounts![0]>0);assert.equal(response.spikeCounts![1],0);
 const off=features(black,white,128,80,.1);off.retina=retina.frame(black,128,80,.05);
 const falling=sim.step(off);assert(falling.spikeCounts![1]>0);assert.equal(falling.spikeCounts![0],0);
});
test('subthreshold dopamine-cell input has a membrane response and zero firing',()=>{
 const base=demoGraph(),g={...base,neurons:base.neurons.slice(0,2).map((n,i)=>({...n,depth:i,neurotransmitter:i?'dopamine':'acetylcholine'})),connections:[{pre_neuron:base.neurons[0].neuron_id,post_neuron:base.neurons[1].neuron_id,synapse_count:5,normalized_weight:1}]};
 const s=new Simulator(g,defaults).step(referenceFeatures('Combined visual drive',20),.2);
 const c={version:CALIBRATION_VERSION,graphId:g.source,parameters:defaults,baseline:0,reference:1,references:[]};
 scoreDopamine(s,[1],c);assert.equal(s.dopamineRateHz,0);assert(s.dopamineRaw!>0);assert(s.dopamine!>0);
 measureDopamine(s,[1]);assert.equal(s.dopamine,undefined);assert(s.dopamineRaw!>0);assert.equal(s.dopamineRateHz,0);
 const blank=new Simulator(g,defaults).step(referenceFeatures('Blank baseline',0));scoreDopamine(blank,[1],c);assert.equal(blank.dopamine,0);
});
