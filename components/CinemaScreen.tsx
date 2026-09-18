'use client';

import {ReactNode,useEffect,useRef} from 'react';

/** Map an 800×450 player onto the four screen corners in the supplied photo. */
export default function CinemaScreen({children}:{children:ReactNode}){
 const frame=useRef<HTMLDivElement>(null),scene=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const host=frame.current,content=scene.current;if(!host||!content)return;
  const resize=()=>{content.style.transform=`scale(${host.clientWidth/1672})`;};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  return()=>observer.disconnect();
 },[]);
 return <div className="cinema-frame" ref={frame}>
  <div className="cinema-scene" ref={scene}>
   {/* This image is the user's supplied theater, preserved without cropping. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img className="cinema-backdrop" src="/images/fly-cinema.png" width={1672} height={941} alt="A fly sitting in a cinema, watching the video on the screen" draggable={false}/>
   <div className="cinema-screen">{children}</div>
  </div>
 </div>;
}
