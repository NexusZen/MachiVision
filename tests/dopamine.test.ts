import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dopamineIndices,dopamineActivity,dopamineHigh} from '../lib/dopamine';
import {demoGraph,State} from '../lib/model';

test('dopamine metric excludes negative labels and averages only positive annotations',()=>{
 const graph=demoGraph();graph.neurons=graph.neurons.slice(0,4);
 ['dopamine','dopamine-negative','acetylcholine; dopamine','gaba'].forEach((nt,i)=>graph.neurons[i].neurotransmitter=nt);
 const ids=dopamineIndices(graph);assert.deepEqual(ids,[0,2]);
 assert.equal(dopamineActivity([.2,1,.6,1],ids),40);
 assert.equal(dopamineActivity([1],[]),null);
});
test('final dopamine high records maximum over the whole clip, not last frame or average',()=>{
 assert.equal(dopamineHigh([{dopamine:10},{dopamine:80},{dopamine:20}] as State[]),80);
 assert.equal(dopamineHigh([]),null);
 assert.equal(dopamineHigh([{dopamine:0}] as State[]),0);
});
