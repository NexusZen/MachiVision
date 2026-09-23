import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoGraph,defaults,State} from '../lib/model';
import {CALIBRATION_VERSION} from '../lib/response-calibration';
test('preset worker emits the first observation before the rest, with complete ordered batches',async()=>{
 const graph=demoGraph();graph.responseCalibration={version:CALIBRATION_VERSION,graphId:graph.source,parameters:defaults,baseline:0,reference:1,references:[]};
 const messages:{frames:State[];completed:number;done:boolean;error?:string}[]=[];
 const scope={onmessage:null as ((e:{data:unknown})=>void)|null,postMessage:(m:typeof messages[number])=>messages.push(m)};
 const oldSelf=Object.getOwnPropertyDescriptor(globalThis,'self'),oldCanvas=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas');
 const ctx={fillStyle:'',save(){},restore(){},scale(){},fillRect(){},getImageData(){return {data:new Uint8ClampedArray(128*80*4)};}};
 Object.defineProperty(globalThis,'self',{value:scope,configurable:true});
 Object.defineProperty(globalThis,'OffscreenCanvas',{value:class {getContext(){return ctx;}},configurable:true});
 try{
  await import('../lib/simulation.worker');await scope.onmessage!({data:{graph,params:defaults,preset:'Horizontal grating',control:'No input'}});
  assert(messages.every(m=>!m.error));assert.equal(messages[0].completed,1);assert.equal(messages[0].frames.length,1);assert.equal(messages[0].done,false);
  assert.equal(messages.at(-1)!.done,true);const frames=messages.flatMap(m=>m.frames);assert.equal(frames.length,240);
  frames.forEach((f,i)=>{assert.equal(f.features.timestamp,i/20);assert.equal(f.active,0);});
 }finally{
  for(const [key,old] of [['self',oldSelf],['OffscreenCanvas',oldCanvas]] as const){if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);}
 }
});
