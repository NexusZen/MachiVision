import {drawStimulus,features,Simulator,Graph,Params,State} from './model';
import {dopamineIndices,measureDopamine} from './dopamine';
import {controlGraph,controlPixels,Control} from './controls';
import {Retina} from './retina';
import {FullSimulator,loadFullModel} from './full-model';
let generation=0;let retainedGraph:Graph;

self.onmessage=async(event:MessageEvent<{graph?:Graph;params:Params;preset:string;control?:Control;job?:number;cancel?:boolean}>)=>{
 const run=++generation,job=event.data.job;
 if(event.data.cancel)return;
 try{
  const {params,preset,control='Normal'}=event.data;
  if(event.data.graph)retainedGraph=event.data.graph;const graph=retainedGraph;
  if(graph.fullModel)self.postMessage({job,status:'Preparing full connectivity and photoreceptor inputs…'});
  const full=graph.fullModel?new FullSimulator(await loadFullModel(graph.fullModel),graph,params,control):null;
  if(run!==generation)return;
  const canvas=new OffscreenCanvas(128,80),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  const ids=dopamineIndices(graph);let batch:State[]=[];

  let previous:Uint8ClampedArray|null=null;const simulator=full?null:new Simulator(controlGraph(graph,control),params),retina=new Retina();
  for(let i=0;i<240;i++){
   drawStimulus(ctx as unknown as CanvasRenderingContext2D,128,80,i/20,preset);
   const pixels=controlPixels(ctx.getImageData(0,0,128,80).data,128,80,control);
   const f=features(pixels,previous,128,80,i/20);if(!full)f.retina=retina.frame(pixels,128,80,.05);
   const state=full?full.step(pixels,128,80,f):simulator!.step(f);delete state.features.retina;
   if(!full)measureDopamine(state,ids);
   previous=pixels;batch.push(state);
   if(i===0||i%4===0||i===239){self.postMessage({job,frames:batch,completed:i+1,total:240,done:i===239});batch=[];}
   await new Promise(resolve=>setTimeout(resolve,0));if(run!==generation)return;
  }

 }catch(error){self.postMessage({job,error:error instanceof Error?error.message:'Simulation failed'});}
};
