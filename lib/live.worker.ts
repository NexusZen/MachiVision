import {features,Simulator,Graph,Params} from './model';
import {dopamineIndices,measureDopamine} from './dopamine';
import {flyVision} from './fly-vision';
import {controlGraph,controlPixels,Control} from './controls';
let control:Control='Normal';
import {Retina} from './retina';
import {FullSimulator,loadFullModel,FullData} from './full-model';
let full:FullSimulator|null=null,fullData:FullData|null=null;
const resetFull=()=>{full=fullData?new FullSimulator(fullData,graph,params,control):null;};
let retina=new Retina();
let simulator:Simulator|null;
let graph:Graph,params:Params,ids:number[]=[],previous:Uint8ClampedArray|null=null,last=-1;
self.onmessage=async(event:MessageEvent<{type:string;graph:Graph;params:Params;pixels:Uint8ClampedArray;time:number;generation?:number;control?:Control}>)=>{
 try{
  const data=event.data;
  if(data.type==='init'){control=data.control||'Normal';graph=data.graph;params=data.params;ids=dopamineIndices(graph);fullData=graph.fullModel?await loadFullModel(graph.fullModel):null;resetFull();previous=null;retina=new Retina();simulator=full?null:new Simulator(controlGraph(graph,control),params);last=-1;self.postMessage({ready:true});return;}
  if(data.type==='reset'){resetFull();previous=null;simulator=new Simulator(controlGraph(graph,control),params);retina=new Retina();last=-1;return;}
  if(data.time<last||data.time-last>.2){resetFull();previous=null;simulator=new Simulator(controlGraph(graph,control),params);retina=new Retina();last=-1;}
  data.pixels=controlPixels(data.pixels,128,80,control);
  const dt=last<0?.05:data.time-last;
  const f=features(data.pixels,previous,128,80,data.time);if(!full)f.retina=retina.frame(data.pixels,128,80,dt);
  const state=full?full.step(data.pixels,128,80,f,dt):simulator!.step(f,dt);delete state.features.retina;
  if(!full)measureDopamine(state,ids);
  const vision=flyVision(data.pixels,previous);previous=data.pixels;last=data.time;
  self.postMessage({state,vision,generation:data.generation},{transfer:[vision.buffer]});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Live analysis failed'});}
};
