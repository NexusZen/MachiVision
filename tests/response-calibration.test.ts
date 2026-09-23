import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {responseIndex,calibrationMatches,referenceFeatures,referenceNames,meanDepolarization} from '../lib/response-calibration';
import {Graph,defaults,simulate,Simulator} from '../lib/model';
import {dopamineActivity,dopamineIndices} from '../lib/dopamine';
const graph:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
test('reference scale has fixed endpoints and preserves intermediate differences',()=>{
 const c=graph.responseCalibration!;
 assert(calibrationMatches(c,graph,defaults));
 assert.equal(responseIndex(c.baseline,c),0);assert.equal(responseIndex(c.reference,c),100);
 assert.equal(responseIndex(c.reference/2,c),50);assert.equal(responseIndex(c.reference*2,c),100);
 assert.equal(responseIndex(null,c),null);assert.equal(responseIndex(1,{...c,reference:0}),null);
 assert(!calibrationMatches({...c,version:'visual-reference-v1-signed'},graph,defaults));assert(!calibrationMatches(c,graph,{...defaults,synapseMv:.5}));assert(!calibrationMatches(c,{...graph,modelId:'changed'},defaults));
});
test('real signed graph references reproduce their membrane response scores',()=>{
 const c=graph.responseCalibration!,ids=dopamineIndices(graph);
 for(const name of referenceNames){const sim=new Simulator(graph,defaults);let a:number[]=[],peak=0;for(let step=0;step<90;step++){const state=sim.step(referenceFeatures(name,step));a=state.activation;peak=Math.max(peak,meanDepolarization(state,ids)??0);}
  assert(Math.abs(peak-c.references.find(r=>r.name===name)!.peak)<1e-9);

 }
});
