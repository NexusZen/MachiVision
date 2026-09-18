import type {Graph,Neuron} from './model';
export type PackedGraph={format:'indexed-v1';source:string;synthetic:boolean;modelId?:Graph['modelId'];responseCalibration?:Graph['responseCalibration'];neurons:Neuron[];edges:[number,number,number,number][]};
export function packGraph(graph:Graph):PackedGraph{
 const ids=new Map(graph.neurons.map((n,i)=>[n.neuron_id,i]));
 return {format:'indexed-v1',source:graph.source,synthetic:graph.synthetic,modelId:graph.modelId,responseCalibration:graph.responseCalibration,neurons:graph.neurons,edges:graph.connections.map(e=>[ids.get(e.pre_neuron)!,ids.get(e.post_neuron)!,e.synapse_count,e.normalized_weight])};
}
export function unpackGraph(graph:PackedGraph):Graph{
 return {source:graph.source,synthetic:graph.synthetic,modelId:graph.modelId,responseCalibration:graph.responseCalibration,neurons:graph.neurons,connections:graph.edges.map(([pre,post,synapse_count,normalized_weight])=>({pre_neuron:graph.neurons[pre].neuron_id,post_neuron:graph.neurons[post].neuron_id,synapse_count,normalized_weight}))};
}
