// Display the model's coarse luminance, spatial contrast and temporal change.
// This is not a reconstructed subjective view or a biological retinal model.
export function flyVision(pixels:Uint8ClampedArray,previous:Uint8ClampedArray|null,w=128,h=80){
 const gray=new Float32Array(w*h),old=new Float32Array(w*h),out=new Uint8ClampedArray(pixels.length);
 for(let i=0;i<gray.length;i++){gray[i]=(pixels[i*4]*.299+pixels[i*4+1]*.587+pixels[i*4+2]*.114)/255;old[i]=previous?(previous[i*4]*.299+previous[i*4+1]*.587+previous[i*4+2]*.114)/255:gray[i];}
 for(let i=0;i<gray.length;i++){
  const x=i%w,y=Math.floor(i/w),edge=Math.min(1,(Math.abs(gray[i]-gray[y*w+Math.max(0,x-1)])+Math.abs(gray[i]-gray[Math.max(0,y-1)*w+x]))*3),motion=Math.min(1,Math.abs(gray[i]-old[i])*5),base=gray[i]*.2+edge*.5;
  out[i*4]=255*Math.min(1,base*.5+motion*.75);out[i*4+1]=255*Math.min(1,base*.9+motion*.95);out[i*4+2]=255*Math.min(1,base*.8+motion*.35);out[i*4+3]=255;
 }return out;
}
