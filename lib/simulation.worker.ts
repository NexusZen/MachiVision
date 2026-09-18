import {drawStimulus,features,simulate,Graph,Params,State} from './model';
import {dopamineIndices,dopamineActivity} from './dopamine';
import {calibrationMatches,createCalibration,scoreDopamine} from './response-calibration';

self.onmessage=(event:MessageEvent<{graph:Graph;params:Params;preset:string}>)=>{
 try{
  const {graph,params,preset}=event.data;
  const canvas=new OffscreenCanvas(128,80),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  const ids=dopamineIndices(graph),frames:State[]=[];
  const calibration=calibrationMatches(graph.responseCalibration,graph,params)?graph.responseCalibration:createCalibration(graph,params);
  let previous:Uint8ClampedArray|null=null,activation:number[]=[];
  for(let i=0;i<240;i++){
   drawStimulus(ctx as unknown as CanvasRenderingContext2D,128,80,i/20,preset);
   const pixels=ctx.getImageData(0,0,128,80).data;
   const state=simulate(features(pixels,previous,128,80,i/20),activation,graph,params);
   scoreDopamine(state,ids,calibration);
   activation=state.activation;previous=pixels;frames.push(state);
  }
  self.postMessage({frames,calibration});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Simulation failed'});}
};
