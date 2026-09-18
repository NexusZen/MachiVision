import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoGraph,simulate,features,trace,defaults,Features} from '../lib/model';
const graph=demoGraph();
const f:Features={timestamp:0,luminance:.5,contrast:0,temporal_change:0,motion_x:0,motion_y:0,motion_magnitude:0,looming:0,flicker:0,left_field_activity:0,right_field_activity:0,scene_change:0,edge_density:0};
test('graph propagation requires a subsequent timestep',()=>{const first=simulate({...f,motion_magnitude:1},[],graph,defaults);assert(first.activation[0]>0);assert.equal(first.activation[42],0);const next=simulate(f,first.activation,graph,defaults);assert(next.activation[42]>0);assert.equal(next.activation[84],0);});
test('decay and connection threshold are applied',()=>{const prev=graph.neurons.map(()=>.5);const s=simulate(f,prev,graph,{...defaults,threshold:100});assert(Math.abs(s.activation[0]-.325)<1e-6);assert.equal(s.activation[42],s.activation[0]);});
test('input path consists only of graph edges',()=>{const path=trace(graph,'demo-0-4-0');assert.equal(path.length,5);for(let i=1;i<path.length;i++)assert(graph.connections.some(e=>e.pre_neuron===path[i-1]&&e.post_neuron===path[i]));assert.deepEqual(trace(graph,'missing'),[]);});
test('black frames have zero visual response and score',()=>{const pixels=new Uint8ClampedArray(128*80*4);const feat=features(pixels,pixels,128,80,0);assert.equal(feat.luminance,0);assert.equal(feat.motion_magnitude,0);assert.equal(simulate(feat,[],graph,defaults).score,0);});
test('temporal brightness changes generate flicker',()=>{const black=new Uint8ClampedArray(128*80*4),white=new Uint8ClampedArray(128*80*4).fill(255);assert.equal(features(white,black,128,80,1).flicker,1);});
test('scores are bounded, deterministic, and use measured components',()=>{const a=simulate({...f,motion_magnitude:1,looming:1},[],graph,defaults),b=simulate({...f,motion_magnitude:1,looming:1},[],graph,defaults);assert.deepEqual(a,b);assert(a.score>=30&&a.score<=100);assert.equal(a.components.motion,1);});
test('recurrent feedback cannot sustain activity after input stops',()=>{
 const loop={...graph,neurons:graph.neurons.slice(0,2).map(n=>({...n,depth:1})),connections:[{pre_neuron:graph.neurons[0].neuron_id,post_neuron:graph.neurons[1].neuron_id,synapse_count:10,normalized_weight:1},{pre_neuron:graph.neurons[1].neuron_id,post_neuron:graph.neurons[0].neuron_id,synapse_count:10,normalized_weight:1}]};
 let a=[1,1];for(let step=0;step<100;step++)a=simulate(f,a,loop,defaults).activation;
 assert(Math.max(...a)<.00001,'Feedback must decay to silence, even in a unit-weight cycle');
});
test('brief input creates a transient downstream response',()=>{
 let a=simulate({...f,motion_magnitude:1,looming:1},[],graph,defaults).activation;
 let peak=0;for(let i=0;i<100;i++){a=simulate(f,a,graph,defaults).activation;peak=Math.max(peak,a[42]);}
 assert(peak>0);assert(Math.max(...a)<.00001);
});
test('retention uses video time rather than number of sampled frames',()=>{
 const p={...defaults,threshold:100},a=graph.neurons.map(()=>.5);
 const once=simulate(f,a,graph,p,.1),twice=simulate(f,simulate(f,a,graph,p,.05).activation,graph,p,.05);
 assert(Math.abs(once.activation[0]-twice.activation[0])<1e-10);
});
