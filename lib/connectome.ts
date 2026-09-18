import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {Graph} from './model';
let cached:{key:string;graph:Promise<Graph>}|undefined;
export async function loadConnectome():Promise<Graph>{
 const file=process.env.CONNECTOME_PATH||path.join(process.cwd(),'data/processed/visual_subgraph.json');
 const metadata=await stat(file),key=`${file}:${metadata.mtimeMs}:${metadata.size}`;
 if(cached?.key===key)return cached.graph;
 const graph=readConnectome(file);cached={key,graph};
 try{return await graph;}catch(error){if(cached?.graph===graph)cached=undefined;throw error;}
}
async function readConnectome(file:string):Promise<Graph> {
 const graph:Graph=JSON.parse(await readFile(file,'utf8'));
 if(graph.synthetic!==false||!graph.source||!graph.neurons.length||graph.neurons.length>20000)throw Error('A verified real connectome subset is required. Run the real-data setup script.');
 const ids=new Set(graph.neurons.map(n=>n.neuron_id));
 if(ids.size!==graph.neurons.length||graph.connections.some(e=>!ids.has(e.pre_neuron)||!ids.has(e.post_neuron)))throw Error('Invalid connectome references.');
 return graph;
}
