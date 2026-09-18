import {features,simulate,Graph,Params} from './model';
import {dopamineIndices,dopamineActivity} from './dopamine';
import {flyVision} from './fly-vision';
import {calibrationMatches,createCalibration,scoreDopamine} from './response-calibration';
import type {ResponseCalibration} from './model';
let calibration:ResponseCalibration;
let graph:Graph,params:Params,ids:number[]=[],previous:Uint8ClampedArray|null=null,activation:number[]=[],last=-1;
self.onmessage=(event:MessageEvent<{type:string;graph:Graph;params:Params;pixels:Uint8ClampedArray;time:number}>)=>{
 try{
  const data=event.data;
  if(data.type==='init'){graph=data.graph;params=data.params;ids=dopamineIndices(graph);calibration=calibrationMatches(graph.responseCalibration,graph,params)?graph.responseCalibration:createCalibration(graph,params);previous=null;activation=[];last=-1;self.postMessage({ready:true,calibration});return;}
  if(data.time<last||data.time-last>.2){previous=null;activation=[];last=-1;}
  const state=simulate(features(data.pixels,previous,128,80,data.time),activation,graph,params,last<0?.05:data.time-last);
  scoreDopamine(state,ids,calibration);
  const vision=flyVision(data.pixels,previous);previous=data.pixels;activation=state.activation;last=data.time;
  self.postMessage({state,vision},{transfer:[vision.buffer]});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Live analysis failed'});}
};
