import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {responseIndex,calibrationMatches,referenceFeatures,referenceNames} from '../lib/response-calibration';
import {Graph,defaults,simulate} from '../lib/model';
import {dopamineActivity,dopamineIndices} from '../lib/dopamine';
const graph:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
test('reference scale has fixed endpoints and preserves intermediate differences',()=>{
 const c=graph.responseCalibration!;
 assert(calibrationMatches(c,graph,defaults));
 assert.equal(responseIndex(c.baseline,c),0);assert.equal(responseIndex(c.reference,c),100);
 assert.equal(responseIndex(c.reference/2,c),50);assert.equal(responseIndex(c.reference*2,c),100);
 assert.equal(responseIndex(null,c),null);assert.equal(responseIndex(1,{...c,reference:0}),null);
 assert(!calibrationMatches(c,graph,{...defaults,gain:.5}));assert(!calibrationMatches(c,{...graph,modelId:'changed'},defaults));
});
test('real signed graph references reproduce their scores and fade after stimulus offset',()=>{
 const c=graph.responseCalibration!,ids=dopamineIndices(graph);
 for(const name of referenceNames){let a:number[]=[],peak=0;for(let step=0;step<90;step++){a=simulate(referenceFeatures(name,step),a,graph,defaults).activation;peak=Math.max(peak,dopamineActivity(a,ids)??0);}
  assert(Math.abs(peak-c.references.find(r=>r.name===name)!.peak)<1e-9);
  for(let step=0;step<100;step++)a=simulate(referenceFeatures('Blank baseline',step),a,graph,defaults).activation;
  assert(Math.max(...a)<.00001);
 }
});
test('an inhibitory connection reduces its target response',()=>{
 const n=graph.neurons[0];
 const g:Graph={source:'test',synthetic:true,neurons:[{...n,neuron_id:'a',depth:1,fast_sign:-1},{...n,neuron_id:'b',depth:1,fast_sign:1}],connections:[{pre_neuron:'a',post_neuron:'b',synapse_count:10,normalized_weight:1}]};
 const inhibited=simulate(referenceFeatures('Blank baseline',0),[1,.5],g,defaults);
 const noConnection=simulate(referenceFeatures('Blank baseline',0),[1,.5],{...g,connections:[]},defaults);
 assert(inhibited.activation[1]<noConnection.activation[1]);assert(inhibited.activation[1]>=0);
});
