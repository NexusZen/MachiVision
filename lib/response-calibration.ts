import {simulate,Graph,Params,Features,ResponseCalibration,State} from './model';
import {dopamineActivity,dopamineIndices} from './dopamine';

export const CALIBRATION_VERSION='visual-reference-v1-signed';
export const referenceNames=['Blank baseline','Sustained contrast','Motion pulse','Looming pulse','Brightness transitions','Combined visual drive'];
// Fixed feature-domain reference stimuli: identical for browser and backend.
// These define a display scale, not biological dopamine concentrations.
export function referenceFeatures(name:string,step:number):Features{
 const f:Features={timestamp:step*.05,luminance:.5,contrast:0,temporal_change:0,motion_x:0,motion_y:0,motion_magnitude:0,looming:0,flicker:0,left_field_activity:0,right_field_activity:0,scene_change:0,edge_density:0};
 const on=step>=10&&step<70;
 if(name==='Sustained contrast'&&on)f.contrast=1;
 if(name==='Motion pulse'&&on){f.motion_magnitude=1;f.contrast=1;f.temporal_change=.3;}
 if(name==='Looming pulse'&&on){f.looming=1;f.contrast=1;f.temporal_change=.3;}
 if(name==='Brightness transitions'&&on&&step%10<2){f.temporal_change=1;f.flicker=1;}
 if(name==='Combined visual drive'&&on){f.motion_magnitude=1;f.looming=1;f.contrast=1;f.temporal_change=1;}
 f.left_field_activity=f.right_field_activity=Math.max(f.motion_magnitude,f.looming,f.temporal_change);
 return f;
}
export function calibrationMatches(c:ResponseCalibration|undefined,graph:Graph,p:Params):c is ResponseCalibration{
 return !!c&&c.version===CALIBRATION_VERSION&&c.graphId===(graph.modelId||graph.source)&&Object.entries(p).every(([key,value])=>c.parameters[key as keyof Params]===value)&&Number.isFinite(c.baseline)&&Number.isFinite(c.reference)&&c.reference>c.baseline+1e-12;
}
export function createCalibration(graph:Graph,p:Params):ResponseCalibration{
 const ids=dopamineIndices(graph);
 const references=referenceNames.map(name=>{let a:number[]=[],peak=0;for(let step=0;step<90;step++){a=simulate(referenceFeatures(name,step),a,graph,p).activation;peak=Math.max(peak,dopamineActivity(a,ids)??0);}return {name,peak};});
 return {version:CALIBRATION_VERSION,graphId:graph.modelId||graph.source,parameters:{...p},baseline:references[0].peak,reference:Math.max(...references.map(r=>r.peak)),references};
}
export function responseIndex(raw:number|null,c:ResponseCalibration):number|null{
 if(raw==null||!Number.isFinite(raw)||c.reference<=c.baseline+1e-12)return null;
 return 100*Math.max(0,Math.min(1,(raw-c.baseline)/(c.reference-c.baseline)));
}
export function scoreDopamine(state:State,ids:number[],calibration:ResponseCalibration){
 state.dopamineRaw=dopamineActivity(state.activation,ids);
 state.dopamine=responseIndex(state.dopamineRaw,calibration);
}
