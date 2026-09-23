import type {Features,Graph,Neuron} from './model';

export const RETINA_WIDTH=36,RETINA_HEIGHT=30;
export type RetinalFrame={width:number;height:number;on:number[][];off:number[][];lightOn?:number[];lightOff?:number[]};
const bounded=(x:number)=>Math.max(0,Math.min(1,x));
// Functional early-vision encoder, not extra connectome neurons. No weights learn.
// Fast light response, local contrast, ON/OFF rectification, delayed correlation.
export class Retina {
 private receptor:Float64Array|null=null;
 private delayedOn:Float64Array|null=null;
 private delayedOff:Float64Array|null=null;
 frame(pixels:Uint8ClampedArray,w:number,h:number,dt:number):RetinalFrame{
  const rw=RETINA_WIDTH,rh=RETINA_HEIGHT,n=rw*rh;
  const light=new Float64Array(n),counts=new Uint32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const k=Math.min(rh-1,Math.floor(y/h*rh))*rw+Math.min(rw-1,Math.floor(x/w*rw)),i=(y*w+x)*4;
   light[k]+=(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])/255;counts[k]++;
  }
  for(let i=0;i<n;i++)light[i]/=counts[i]||1;
  const first=this.receptor===null;
  if(first)this.receptor=light.slice();
  const r=Math.exp(-Math.max(0,dt)/.01),slow=Math.exp(-Math.max(0,dt)/.03);
  const on=new Float64Array(n),off=new Float64Array(n),lightOn=Array(n).fill(0),lightOff=Array(n).fill(0);
  for(let i=0;i<n;i++){const before=this.receptor![i];this.receptor![i]=r*before+(1-r)*light[i];if(!first){const delta=this.receptor![i]-before;lightOn[i]=bounded(delta);lightOff[i]=bounded(-delta);}}
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
   const i=y*rw+x;let sum=0,count=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<rw&&yy>=0&&yy<rh){sum+=this.receptor![yy*rw+xx];count++;}}
   const contrast=(this.receptor![i]-sum/count)/(sum/count+.05);
   on[i]=bounded(contrast);off[i]=bounded(-contrast);
  }
  if(first){this.delayedOn=on.slice();this.delayedOff=off.slice();}
  const motion=(now:Float64Array,delay:Float64Array)=>{
   // Screen directions: right, left, up, down. No motion signal at startup.
   const result=Array.from({length:4},()=>Array(n).fill(0));
   if(!first)for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
    const i=y*rw+x;
    for(const [d,dx,dy] of [[0,-1,0],[1,1,0],[2,0,1],[3,0,-1]]){
     const xx=x+dx,yy=y+dy;
     if(xx<0||xx>=rw||yy<0||yy>=rh||Math.floor(xx/(rw/2))!==Math.floor(x/(rw/2)))continue;
     const j=yy*rw+xx;result[d][i]=bounded(4*(delay[j]*now[i]-delay[i]*now[j]));
    }
   }
   for(let i=0;i<n;i++)delay[i]=slow*delay[i]+(1-slow)*now[i];
   return result;
  };
  return {width:rw,height:rh,on:motion(on,this.delayedOn!),off:motion(off,this.delayedOff!),lightOn,lightOff};
 }
}
export function isDrivenInput(n:Neuron){return n.depth===0||!!n.visual_column&&(n.cell_type==='Mi1'||n.cell_type==='Tm1');}
export function sensoryDrive(n:Neuron,f:Features):number{
 const type=n.cell_type||'',left=n.hemisphere.toLowerCase()==='left';
 if(type==='LC4'||n.input_feature==='looming')return bounded(f.looming);
 if(type==='Mi1'||type==='Tm1'){
  if(!n.visual_column)return 0;
  if(!f.retina)return bounded((type==='Mi1'?f.luminance_on:f.luminance_off)||0);
  const r=f.retina,c=n.visual_column,x=Math.max(0,Math.min(r.width-1,Math.round(c.u*(r.width-1)))),y=Math.max(0,Math.min(r.height-1,Math.round(c.v*(r.height-1))));
  return (type==='Mi1'?r.lightOn:r.lightOff)?.[y*r.width+x]||0;
 }
 const subtype=/^T[45]([abcd])$/.exec(type);
 if(subtype){
  if(f.retina){
   if(!n.visual_column)return 0;
   const {u,v}=n.visual_column,{width,height}=f.retina;
   const x=Math.max(0,Math.min(width-1,Math.round(u*(width-1)))),y=Math.max(0,Math.min(height-1,Math.round(v*(height-1))));
   const d=subtype[1]==='a'?(left?1:0):subtype[1]==='b'?(left?0:1):subtype[1]==='c'?2:3;
   return f.retina[type.startsWith('T4')?'on':'off'][d][y*width+x]||0;
  }
  // Uniform feature-domain references: direction is explicit; video uses retina.
  const horizontal=subtype[1]==='a'?(left?-f.motion_x:f.motion_x):subtype[1]==='b'?(left?f.motion_x:-f.motion_x):subtype[1]==='c'?-f.motion_y:f.motion_y;
  return bounded(horizontal)*f.contrast;
 }
 return bounded(f.contrast*.12+f.motion_magnitude*.45+f.looming*.45+f.temporal_change*.3);
}
export function inputCoverage(g:Graph){const inputs=g.neurons.filter(n=>n.depth===0&&/^T[45][abcd]$/.test(n.cell_type||''));return {mapped:inputs.filter(n=>n.visual_column).length,total:inputs.length};}
