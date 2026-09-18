import {loadConnectome} from '@/lib/connectome';
import {packGraph} from '@/lib/graph-wire';
const responses=new WeakMap<object,string>();
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const graph=await loadConnectome();if(new URL(request.url).searchParams.has('compact')){let body=responses.get(graph);if(!body){body=JSON.stringify(packGraph(graph));responses.set(graph,body);}return new Response(body,{headers:{'Content-Type':'application/json'}});}return Response.json(graph);}catch(e){return Response.json({error:`Real connectome unavailable: ${(e as Error).message}`},{status:503});}}
