import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {Graph} from './model';
let cached:{key:string;graph:Promise<Graph>}|undefined;
export async function loadConnectome():Promise<Graph>{
 const file=process.env.CONNECTOME_PATH||path.join(process.cwd(),'data/processed/visual_subgraph.json');
 const [metadata,fullMetadata]=await Promise.all([stat(file),stat(path.join(process.cwd(),'data/processed/full-model.json'))]),key=`${file}:${metadata.mtimeMs}:${metadata.size}:${fullMetadata.mtimeMs}`;
 if(cached?.key===key)return cached.graph;
 const graph=readConnectome(file);cached={key,graph};
 try{return await graph;}catch(error){if(cached?.graph===graph)cached=undefined;throw error;}
}
async function readConnectome(file:string):Promise<Graph> {
 const graph:Graph=JSON.parse(await readFile(file,'utf8'));
 if(graph.synthetic!==false||!graph.source||!graph.neurons.length||graph.neurons.length>20000)throw Error('A verified real connectome subset is required. Run the real-data setup script.');
 const ids=new Set(graph.neurons.map(n=>n.neuron_id));
 if(ids.size!==graph.neurons.length||graph.connections.some(e=>!ids.has(e.pre_neuron)||!ids.has(e.post_neuron)))throw Error('Invalid connectome references.');

 const manifest=JSON.parse(await readFile(path.join(process.cwd(),'data/processed/full-model.json'),'utf8'));
 const metadata=JSON.parse(await readFile(path.join(process.cwd(),'public/models',manifest.modelId,'neurons.json'),'utf8'));
 const fullNodes=new Map<string,[string,number,number,number,number,number,number]>(metadata.nodes.map((n:[string,number,number,number,number,number,number])=>[n[0],n]));
 for(const neuron of graph.neurons){const n=fullNodes.get(neuron.neuron_id);if(!n)throw Error('Display identity missing from full model');neuron.fast_sign=n[3];neuron.input_feature=null;
  if(['R1-6','R7','R8'].includes(neuron.cell_type||'')&&n[4]>=0)neuron.visual_column={p:0,q:0,column_id:-1,u:n[4],v:n[5],source:'Full-model mapping; see photoreceptor-mapping.json for inference confidence'};
 }
 graph.fullModel=manifest;graph.modelId=manifest.modelId;graph.source='FlyWire FAFB v783 · full annotated brain · photoreceptor input';
 return graph;
}
