'use client';
import {memo,useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {Graph} from '@/lib/model';
function Brain({graph,activation,onSelect,view,connections,region}:{graph:Graph;activation:number[];onSelect:(id:string)=>void;view:string;connections:boolean;region:string}){
 const controller=useRef<{update:(view:string,connections:boolean,region:string)=>void;invalidate:()=>void}|null>(null);
 const host=useRef<HTMLDivElement>(null),values=useRef(activation),select=useRef(onSelect);values.current=activation;select.current=onSelect;
 useEffect(()=>{if(!host.current)return;const el=host.current,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(...(view==='Dorsal'?[0,11,.1]:view==='Side'?[11,0,0]:[0,.5,10.5]) as [number,number,number]);let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{el.textContent='WebGL is unavailable. Activity remains available in the panels below.';return;}renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));el.appendChild(renderer.domElement);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=22;
 const positions=new Float32Array(graph.neurons.flatMap(n=>n.position)),colors=new Float32Array(positions.length),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const ctx=sprite.getContext('2d')!;const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.25,'rgba(255,255,255,.85)');gradient.addColorStop(.65,'rgba(255,255,255,.18)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const texture=new THREE.CanvasTexture(sprite);
 const material=new THREE.PointsMaterial({size:.065,map:texture,vertexColors:true,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending});const points=new THREE.Points(geometry,material);scene.add(points);
 const lookup=new Map(graph.neurons.map(n=>[n.neuron_id,n.position]));const edges=new THREE.BufferGeometry();edges.setAttribute('position',new THREE.Float32BufferAttribute([...graph.connections].sort((a,b)=>b.synapse_count-a.synapse_count).slice(0,18000).flatMap(e=>[...(lookup.get(e.pre_neuron)||[0,0,0]),...(lookup.get(e.post_neuron)||[0,0,0])]),3));const lines=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x69b4a4,transparent:true,opacity:.018}));lines.visible=connections;scene.add(lines);
 const resting=new THREE.Color('#a9bdb0');
 const surfaces:{mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;members:number[];color:THREE.Color}[]=[];
 scene.add(new THREE.HemisphereLight(0xf2fff5,0x4b605d,2));
 const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(-3,6,9);scene.add(light);
 const fill=new THREE.DirectionalLight(0xb8e8d2,1);fill.position.set(4,-2,-5);scene.add(fill);
 let disposed=false;
 let visible=graph.neurons.map(n=>region==='All regions'||(n.super_class||n.brain_region)===region),activeRegion=region,activeView=view;
 const haloMaterial=new THREE.PointsMaterial({size:.16,map:texture,vertexColors:true,transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending});const halos=new THREE.Points(geometry,haloMaterial);scene.add(halos);
 let raf=0,last:number[]|null=null,onScreen=true;const invalidate=()=>{if(!raf&&onScreen&&!document.hidden)raf=requestAnimationFrame(render);};
 const resize=()=>{renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();invalidate();};const observer=new ResizeObserver(resize);observer.observe(el);const ray=new THREE.Raycaster();ray.params.Points!.threshold=.12;const pick=(event:PointerEvent)=>{const b=el.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-b.left)/b.width*2-1,-(event.clientY-b.top)/b.height*2+1),camera);const hit=ray.intersectObject(points)[0];if(hit?.index!==undefined&&visible[hit.index])select.current(graph.neurons[hit.index].neuron_id);};renderer.domElement.addEventListener('pointerup',pick);
 const render=()=>{raf=0;if(!onScreen||document.hidden)return;if(last!==values.current){last=values.current;
  for(let i=0;i<graph.neurons.length;i++){const a=Math.sqrt(Math.max(0,Math.min(1,values.current[i]||0))),v=visible[i]?1:.05;colors[i*3]=(.25+a*.5)*v;colors[i*3+1]=(.35+a*.6)*v;colors[i*3+2]=(.3+a*.35)*v;}
  geometry.attributes.color.needsUpdate=true;
  for(const surface of surfaces){let peak=0,hasVisible=false;for(const i of surface.members)if(visible[i]){hasVisible=true;peak=Math.max(peak,values.current[i]||0);}const strength=Math.sqrt(Math.max(0,Math.min(1,peak))),mat=surface.mesh.material;mat.color.copy(resting).lerp(surface.color,strength);mat.emissive.copy(surface.color);mat.emissiveIntensity=strength*.55;mat.opacity=activeRegion!=='All regions'&&!hasVisible?.08:.32+strength*.5;}
 }const moving=controls.update();renderer.render(scene,camera);if(moving)invalidate();};
 const abort=new AbortController(),indices=new Map(graph.neurons.map((n,i)=>[n.neuron_id,i]));
 fetch('/brain/neuropils.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Surface load failed');return r.json();}).then((data:{regions:{name:string;positions:number[];indices:number[];neurons:string[]}[]})=>{
  if(disposed)return;
  for(const r of data.regions){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(r.positions,3));g.setIndex(r.indices);g.computeVertexNormals();const mat=new THREE.MeshStandardMaterial({color:resting,roughness:.76,transparent:true,opacity:.32,depthWrite:false,side:THREE.FrontSide});const mesh=new THREE.Mesh(g,mat);mesh.name=r.name;scene.add(mesh);surfaces.push({mesh,members:r.neurons.map(id=>indices.get(id)).filter((i):i is number=>i!==undefined),color:new THREE.Color(r.name.startsWith('ME_')?'#eed46b':r.name.startsWith('LO_')?'#80df83':r.name.startsWith('LOP_')?'#50bfd0':'#b5efac')});}
  points.visible=false;halos.visible=false;last=null;invalidate();
 }).catch(error=>{if(error.name!=='AbortError'&&!disposed)el.title='Anatomical surfaces unavailable; showing real neuron anchors.';});
 controls.addEventListener('change',invalidate);
 controller.current={invalidate,update:(nextView,nextConnections,nextRegion)=>{
  if(nextView!==activeView){activeView=nextView;camera.position.set(...(nextView==='Dorsal'?[0,11,.1]:nextView==='Side'?[11,0,0]:[0,.5,10.5]) as [number,number,number]);controls.target.set(0,0,0);controls.update();}
  lines.visible=nextConnections;
  if(nextRegion!==activeRegion){activeRegion=nextRegion;visible=graph.neurons.map(n=>nextRegion==='All regions'||(n.super_class||n.brain_region)===nextRegion);last=null;}
  invalidate();
 }};
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else invalidate();};document.addEventListener('visibilitychange',visibility);
 const intersection=new IntersectionObserver(entries=>{onScreen=entries[0].isIntersecting;if(onScreen)invalidate();else{cancelAnimationFrame(raf);raf=0;}});intersection.observe(el);
 resize();invalidate();return()=>{disposed=true;abort.abort();for(const {mesh} of surfaces){mesh.geometry.dispose();mesh.material.dispose();}controller.current=null;intersection.disconnect();document.removeEventListener('visibilitychange',visibility);controls.removeEventListener('change',invalidate);cancelAnimationFrame(raf);observer.disconnect();controls.dispose();geometry.dispose();edges.dispose();material.dispose();(lines.material as THREE.Material).dispose();haloMaterial.dispose();texture.dispose();renderer.dispose();el.replaceChildren();};
 },[graph]);
 useEffect(()=>{controller.current?.update(view,connections,region);},[graph,activation,view,connections,region]);return <div className="brain-canvas" ref={host} aria-label="Interactive anatomical fly brain with modeled region activity"/>;
}

export default memo(Brain);
