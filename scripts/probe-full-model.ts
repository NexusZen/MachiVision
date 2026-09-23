import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {FullSimulator,FullData} from '../lib/full-model';
import {defaults,features,Graph} from '../lib/model';

const manifest=JSON.parse(readFileSync('data/processed/full-model.json','utf8'));
const root='public'+manifest.baseUrl;
const array=(name:string)=>{const b=readFileSync(`${root}/${name}`);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const data:FullData={...JSON.parse(readFileSync(`${root}/neurons.json`,'utf8')),offsets:new Uint32Array(array('offsets.bin')),posts:new Uint32Array(array('posts.bin')),counts:new Float32Array(array('counts.bin'))};
const graph:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
for(const control of ['Normal','No input','Disconnected inputs'] as const){
 const sim=new FullSimulator(data,graph,{...defaults,threshold:1},control,process.env.PASSIVE==='1'),start=performance.now();let previous:Uint8ClampedArray|null=null;
 for(let i=0;i<Number(process.env.PROBE_FRAMES||20);i++){
  const pixels=new Uint8ClampedArray(128*80*4).fill(i<10?220:20),f=features(pixels,previous,128,80,i/20);
  const t=performance.now(),s=sim.step(pixels,128,80,f);previous=pixels;
  if(i===0||i===4||i===9||i===19)console.log(JSON.stringify({control,frame:i,ms:performance.now()-t,active:s.active,Hz:s.networkMeanRateHz,DA:s.dopamineRaw,circuits:s.circuits}));
 }
 console.log(JSON.stringify({control,totalMs:performance.now()-start}));
}
