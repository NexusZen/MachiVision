import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packGraph,unpackGraph} from '../lib/graph-wire';
import {Graph,defaults,Simulator,Features} from '../lib/model';

test('compact transport preserves real neuron IDs, every edge, and simulated activity',()=>{
 const graph:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
 const packed=packGraph(graph),restored=unpackGraph(packed);
 assert.deepEqual(restored.neurons,graph.neurons);
 assert.equal(restored.connections.length,graph.connections.length);
 graph.connections.forEach((edge,i)=>{const actual=restored.connections[i];assert.equal(actual.pre_neuron,edge.pre_neuron);assert.equal(actual.post_neuron,edge.post_neuron);assert.equal(actual.synapse_count,edge.synapse_count);assert.equal(actual.normalized_weight,edge.normalized_weight);});
 const f={timestamp:0,luminance:0,contrast:.8,temporal_change:.2,motion_x:0,motion_y:0,motion_magnitude:.5,looming:.3,flicker:0,left_field_activity:.5,right_field_activity:.5,scene_change:0,edge_density:0} satisfies Features;
 assert.deepEqual(new Simulator(restored,defaults).step(f),new Simulator(graph,defaults).step(f));
 const originalBytes=Buffer.byteLength(JSON.stringify(graph)),packedBytes=Buffer.byteLength(JSON.stringify(packed));
 assert.ok(packedBytes<originalBytes*.5);
 console.log(`Graph JSON: ${originalBytes} -> ${packedBytes} bytes; ${graph.neurons.length} neurons and ${graph.connections.length} edges retained.`);
});
