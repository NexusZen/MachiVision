import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brainAreas,areaActivity} from '../lib/brain-areas';
import type {Graph} from '../lib/model';

test('real anchors partition deterministically into complete, compact 50–60 neuron areas',()=>{
 const graph:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
 const areas=brainAreas(graph.neurons);
 assert.ok(graph.neurons.length>=10000);
 assert.ok(areas.every(ids=>ids.length>=50&&ids.length<=60));
 assert.equal(new Set(areas.flat()).size,graph.neurons.length);
 assert.equal(areas.flat().length,graph.neurons.length);
 assert.deepEqual(brainAreas(graph.neurons),areas);
});

test('one active neuron illuminates its area, without changing individual activity',()=>{
 const activation=[0,.64,0,0],areas=[[0,1],[2,3]];
 assert.ok(Math.abs(areaActivity(areas,activation)[0]-.64)<1e-6);
 assert.equal(areaActivity(areas,activation)[1],0);
 assert.deepEqual(activation,[0,.64,0,0]);
 assert.deepEqual([...areaActivity(areas,activation,[true,false,true,true])],[0,0]);
 assert.deepEqual([...areaActivity(areas,[0,0,0,0])],[0,0]);
});
