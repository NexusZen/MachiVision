import {readFileSync} from 'node:fs';
import {drawStimulus,defaults,features,Graph,Simulator} from '../lib/model';
import {Retina} from '../lib/retina';
import {measureDopamine} from '../lib/dopamine';
import {dopamineIndices} from '../lib/dopamine';
const g:Graph=JSON.parse(readFileSync('data/processed/visual_subgraph.json','utf8'));
for(const preset of ['Horizontal grating','Vertical grating','Flashing light']){
 const sim=new Simulator(g,defaults),retina=new Retina(),ids=dopamineIndices(g);const started=performance.now();let firstMs=0,peakDepolarizationMv=0;let previous:Uint8ClampedArray|null=null,spikes=0,da=0,peak=0,voltage=-52,drive=0;
 for(let t=0;t<240;t++){
  const pixels=new Uint8ClampedArray(128*80*4);
  const ctx={fillStyle:'#000000',save(){},restore(){},scale(){},fillRect(x:number,y:number,w:number,h:number){const c=[1,3,5].map(i=>parseInt(this.fillStyle.slice(i,i+2),16));for(let yy=Math.max(0,Math.floor(y));yy<Math.min(80,Math.ceil(y+h));yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(128,Math.ceil(x+w));xx++){const a=Math.max(0,Math.min(xx+1,x+w)-Math.max(xx,x))*Math.max(0,Math.min(yy+1,y+h)-Math.max(yy,y));for(let k=0;k<3;k++)pixels[(yy*128+xx)*4+k]=pixels[(yy*128+xx)*4+k]*(1-a)+c[k]*a;pixels[(yy*128+xx)*4+3]=255;}}};
  drawStimulus(ctx as unknown as CanvasRenderingContext2D,128,80,t/20,preset);
  const f=features(pixels,previous,128,80,t/20);f.retina=retina.frame(pixels,128,80,.05);
  drive+=f.retina.on.flat().reduce((s,x)=>s+x,0)+f.retina.off.flat().reduce((s,x)=>s+x,0);
  const s=sim.step(f);measureDopamine(s,ids);peakDepolarizationMv=Math.max(peakDepolarizationMv,s.dopamineRaw??0);if(t===0)firstMs=performance.now()-started;spikes+=s.spikeCounts!.reduce((a,b)=>a+b,0);const count=ids.reduce((a,i)=>a+s.spikeCounts![i],0);da+=count;peak=Math.max(peak,count);voltage=Math.max(voltage,...ids.map(i=>s.voltageMv![i]));previous=pixels;
 }
 console.log({preset,firstMs,totalMs:performance.now()-started,spikes,da,peak,peakDepolarizationMv,voltage,drive});
 if(spikes===0||peakDepolarizationMv<=0)throw Error(`${preset} lost its modeled response`);
 if(preset==='Flashing light'&&drive>1e-8)throw Error('Uniform flash fabricated motion');
}
