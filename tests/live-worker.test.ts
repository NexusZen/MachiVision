import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoGraph,defaults,State} from '../lib/model';

test('live worker preserves delayed state and clears it on an explicit short seek',async()=>{
 const messages:{ready?:boolean;state?:State;generation?:number;error?:string}[]=[];
 const worker={onmessage:null as ((event:{data:unknown})=>void)|null,postMessage:(message:typeof messages[number])=>messages.push(message)};
 const original=Object.getOwnPropertyDescriptor(globalThis,'self');
 Object.defineProperty(globalThis,'self',{value:worker,configurable:true});
 try{
  await import('../lib/live.worker');
  const send=(data:unknown)=>worker.onmessage!({data});
  send({type:'init',graph:demoGraph(),params:defaults});
  assert(messages.pop()?.ready);
  const black=new Uint8ClampedArray(128*80*4),white=new Uint8ClampedArray(128*80*4).fill(255);
  send({type:'frame',pixels:black,time:0,generation:0});
  send({type:'frame',pixels:white,time:.05,generation:0});
  assert(messages.at(-1)!.state!.active>0);
  send({type:'frame',pixels:white,time:.1,generation:0});
  send({type:'reset'});
  send({type:'frame',pixels:white,time:.15,generation:1});
  const result=messages.at(-1)!;
  assert.equal(result.error,undefined);assert.equal(result.generation,1);
  assert.equal(result.state!.active,0);
 }finally{
  if(original)Object.defineProperty(globalThis,'self',original);else Reflect.deleteProperty(globalThis,'self');
 }
});
