import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Retina,sensoryDrive,inputCoverage} from '../lib/retina';
import {controlGraph,controlPixels} from '../lib/controls';
import {demoGraph,defaults,Graph,Simulator} from '../lib/model';
import {referenceFeatures} from '../lib/response-calibration';
const frame=(offset:number,dark=false)=>{
 const p=new Uint8ClampedArray(36*30*4);
 for(let y=0;y<30;y++)for(let x=0;x<36;x++){const v=((x-offset+360)%8<3)!==dark?240:20;for(let c=0;c<3;c++)p[(y*36+x)*4+c]=v;p[(y*36+x)*4+3]=255;}return p;
};
test('retinal direction selectivity reverses with motion and static input stays silent',()=>{
 for(const dark of [false,true])for(const direction of [-1,1]){
  const retina=new Retina(),totals=[0,0,0,0];
  for(let t=0;t<12;t++){const r=retina.frame(frame(t*direction,dark),36,30,.05);r[dark?'off':'on'].forEach((a,d)=>totals[d]+=a.reduce((s,v)=>s+v,0));}
  assert(totals[direction===1?0:1]>totals[direction===1?1:0]*2);
 }
 const retina=new Retina();retina.frame(frame(0),36,30,.05);
 const fixed=retina.frame(frame(0),36,30,.05);assert(Math.max(...fixed.on.flat(),...fixed.off.flat())<1e-12);
});
test('T4 and T5 sample separate channels at published columns; missing fields receive no invented mapping',()=>{
 const g:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
 assert.deepEqual(inputCoverage(g),{mapped:984,total:1024});
 const n={...g.neurons.find(n=>n.cell_type==='T4a'&&n.visual_column)!,hemisphere:'Right'};
 const f=referenceFeatures('Motion pulse',20);f.retina={width:1,height:1,on:[[.8],[.1],[.2],[.3]],off:[[.2],[.4],[.5],[.6]]};
 assert.equal(sensoryDrive(n,f),.8);assert.equal(sensoryDrive({...n,cell_type:'T5a'},f),.2);
 assert.equal(sensoryDrive({...n,visual_column:undefined},f),0);
 assert.equal(sensoryDrive({...n,hemisphere:'Left'},f),.1);
});
test('controls are deterministic, preserve source data, and disconnect downstream spikes',()=>{
 const g=demoGraph(),before=JSON.stringify(g),a=controlGraph(g,'Shuffled wiring');
 assert.deepEqual(a,controlGraph(g,'Shuffled wiring'));assert.notDeepEqual(a.connections,g.connections);
 assert.deepEqual(a.connections.map(e=>e.post_neuron).sort(),g.connections.map(e=>e.post_neuron).sort());
 assert.equal(JSON.stringify(g),before);
 const cut=controlGraph(g,'Disconnected inputs'),s=new Simulator(cut,defaults).step(referenceFeatures('Combined visual drive',20),.5);
 assert(s.active>0);cut.neurons.forEach((n,i)=>{if(n.depth>0)assert.equal(s.spikeCounts![i],0);});
 const p=frame(2);assert.deepEqual(controlPixels(controlPixels(p,36,30,'Mirrored image'),36,30,'Mirrored image'),p);
 assert(controlPixels(p,36,30,'No input').every(v=>v===0));
});
