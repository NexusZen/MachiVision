'use client';

import {useState,useEffect,useRef,useMemo} from 'react';

import {Activity,ArrowUpRight,Play,Pause,Upload,RotateCcw,Maximize2,ChevronRight,Download,SlidersHorizontal,Scan,BrainCircuit,Layers,SkipBack,SkipForward,X,GitBranch,FlaskConical,Eye} from 'lucide-react';

import {peakActivity,formatScore} from '@/lib/activity-score';
import {dopamineIndices,peakMembrane,formatResponse} from '@/lib/dopamine';
import {unpackGraph} from '@/lib/graph-wire';
import Brain from '@/components/Brain';
import CinemaScreen from '@/components/CinemaScreen';

import {defaults,presets,drawStimulus,trace,State,Params,Graph,ResponseCalibration} from '@/lib/model';
import {flyVision} from '@/lib/fly-vision';
import {controls,controlGraph,Control,SHUFFLE_SEED} from '@/lib/controls';
import {inputCoverage,isDrivenInput} from '@/lib/retina';
import {DYNAMICS_VERSION} from '@/lib/dynamics';
import {FULL_DYNAMICS_VERSION} from '@/lib/full-model';

const stamp=(t:number)=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;

const parameterLabels:Record<keyof Params,string>={membraneMs:'Membrane time constant (ms)',synapseMv:'Synaptic scale (mV / synapse)',input:'Input drive multiplier',threshold:'Minimum synapse count',hops:'Enabled depth levels'};
const formatRegionActivity=(r:string,a:number)=>{
 const isDirect=['optic','visual_projection','visual projection'].includes(r.toLowerCase().trim());
 const pct=a*100;
 if(isDirect)return `${Math.round(pct)}%`;
 if(!a||pct<=0)return '0%';
 if(pct>=10)return `${Math.round(pct)}%`;
 if(pct>=1)return `${pct.toFixed(1)}%`;
 if(pct>=0.01)return `${pct.toFixed(2)}%`;
 return `${pct.toFixed(3)}%`;
};

export default function Lab(){

 const [graph,setGraph]=useState<Graph>({source:'Loading real connectome',synthetic:false,neurons:[],connections:[]}),[preset,setPreset]=useState('Looming object'),[frames,setFrames]=useState<State[]>([]),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[loop,setLoop]=useState(false),[params,setParams]=useState<Params>(defaults),[draftParams,setDraftParams]=useState<Params>(defaults),[view,setView]=useState('Front'),[connections,setConnections]=useState(false),[region,setRegion]=useState('All regions'),[selected,setSelected]=useState<string|null>(null),[tab,setTab]=useState('Experiment'),[panel,setPanel]=useState(''),[url,setUrl]=useState(''),[filename,setFilename]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[battle,setBattle]=useState<{name:string;frames:State[];engine:string}|null>(null),[overlay,setOverlay]=useState(true),[progress,setProgress]=useState(''),[loadError,setLoadError]=useState(''),[clipDuration,setClipDuration]=useState(12),[detailsOpen,setDetailsOpen]=useState(true),[dragging,setDragging]=useState(false),[buffering,setBuffering]=useState(false),[bufferingPct,setBufferingPct]=useState(0);

 const desiredPlaying=useRef(false),livePending=useRef(false);desiredPlaying.current=playing;
 const presetWorker=useRef<Worker|null>(null),presetJob=useRef(0);
 useEffect(()=>()=>{presetWorker.current?.terminate();presetWorker.current=null;},[]);
 const presetCache=useRef(new Map<string,{frames:State[]}>());
 const [control,setControl]=useState<Control>('Normal');
 const runGraph=useMemo(()=>controlGraph(graph,control),[graph,control]);
 const coverage=useMemo(()=>inputCoverage(graph),[graph]);
 const [interpreted,setInterpreted]=useState(false),[liveCurrent,setLiveCurrent]=useState<State|null>(null);
 const visionCanvas=useRef<HTMLCanvasElement>(null),liveVision=useRef<Uint8ClampedArray|null>(null),presetVisionRef=useRef<Uint8ClampedArray|null>(null),visions=useRef<(Uint8ClampedArray|null)[]>([]);
 const dopamineCells=useMemo(()=>dopamineIndices(graph),[graph]);
 const canvas=useRef<HTMLCanvasElement>(null),video=useRef<HTMLVideoElement>(null),upload=useRef<HTMLInputElement>(null),player=useRef<HTMLDivElement>(null),resultPanel=useRef<HTMLElement>(null);

 useEffect(()=>{const controller=new AbortController();fetch('/api/connectome?compact=1',{signal:controller.signal}).then(async r=>{const g=await r.json();if(!r.ok||g.synthetic||g.error)throw Error(g.error||'Real data is required.');setGraph(unpackGraph(g));if(g.fullModel){setParams({...defaults,threshold:1});setDraftParams({...defaults,threshold:1});}}).catch(e=>{if(e.name!=='AbortError')setLoadError(e.message);});return()=>controller.abort();},[]);

 useEffect(()=>{
  if(url){presetWorker.current?.terminate();presetWorker.current=null;return;}if(!graph.neurons.length)return;
  const key=JSON.stringify([graph.modelId,preset,params,control]),cached=presetCache.current.get(key);
  setTime(0);setError('');setLiveCurrent(null);
  if(cached){setFrames(cached.frames);setBusy(false);setProgress('');return;}
  setFrames([]);setBusy(true);setProgress('Preparing first observation…');
  const fresh=!presetWorker.current,worker=presetWorker.current??new Worker(new URL('../lib/simulation.worker.ts',import.meta.url));presetWorker.current=worker;
  const job=++presetJob.current;let collected:State[]=[],cancelled=false;
  worker.onmessage=({data})=>{
   if(cancelled||data.job!==job)return;
   if(data.status){setProgress(data.status);return;}
   if(data.error){setError(data.error);setBusy(false);setProgress('');worker.terminate();presetWorker.current=null;return;}
   collected=collected.concat(data.frames);setFrames(collected);
   setProgress(`Computed ${data.completed} / ${data.total} observations`);
   if(data.done){
    presetCache.current.set(key,{frames:collected});
    while(presetCache.current.size>2)presetCache.current.delete(presetCache.current.keys().next().value!);
    setBusy(false);setProgress('');
   }
  };
  worker.onerror=()=>{setError('Could not prepare the simulation. Choose a preset to retry.');setBusy(false);setProgress('');worker.terminate();presetWorker.current=null;};
  worker.postMessage({graph:fresh?graph:undefined,params,preset,control,job});return()=>{cancelled=true;worker.postMessage({cancel:true});};
 },[preset,params,graph,url,control]);

 useEffect(()=>{if(!url&&canvas.current)drawStimulus(canvas.current.getContext('2d')!,800,450,time,preset);},[time,preset,url,graph]);

 useEffect(()=>{if(!url)return;return()=>URL.revokeObjectURL(url);},[url]);
 useEffect(()=>{
  if(!url||!graph.neurons.length)return;
  let cancelled=false;
  setBuffering(true);setBufferingPct(0);setBusy(true);setPlaying(false);
  setProgress('Initializing connectome simulation worker…');
  setFrames([]);setLiveCurrent(null);visions.current=[];
  const worker=new Worker(new URL('../lib/live.worker.ts',import.meta.url));
  const v=video.current;
  if(!v){worker.terminate();return;}
  v.pause();v.currentTime=0;
  const sample=document.createElement('canvas');sample.width=128;sample.height=80;
  const ctx=sample.getContext('2d',{willReadFrequently:true})!;

  const runPreload=async()=>{
   await new Promise<void>((resolve,reject)=>{
    const onMsg=({data}:MessageEvent)=>{
     if(cancelled)return;
     if(data.ready){worker.removeEventListener('message',onMsg);resolve();}
     else if(data.error){worker.removeEventListener('message',onMsg);reject(new Error(data.error));}
    };
    worker.addEventListener('message',onMsg);
    worker.postMessage({type:'init',graph,params,control});
   });
   if(cancelled)return;

   const offscreen=document.createElement('video');
   offscreen.src=url;
   offscreen.muted=true;
   offscreen.playsInline=true;
   offscreen.preload='auto';
   offscreen.style.position='fixed';
   offscreen.style.top='-9999px';
   offscreen.style.left='-9999px';
   offscreen.style.width='128px';
   offscreen.style.height='80px';
   offscreen.style.opacity='0';
   offscreen.style.pointerEvents='none';
   document.body.appendChild(offscreen);

   if(offscreen.readyState<2){
    await new Promise<void>(resolve=>{
     let settled=false;
     const done=()=>{if(settled)return;settled=true;offscreen.removeEventListener('loadedmetadata',done);offscreen.removeEventListener('canplay',done);resolve();};
     offscreen.addEventListener('loadedmetadata',done);
     offscreen.addEventListener('canplay',done);
     setTimeout(done,5000);
    });
   }
   if(cancelled){offscreen.remove();return;}

   const d=offscreen.duration&&Number.isFinite(offscreen.duration)?offscreen.duration:(clipDuration||12);
   setClipDuration(d);
   const dt=0.05,total=Math.max(1,Math.ceil(d/dt));
   const collected:State[]=[],collectedVisions:(Uint8ClampedArray|null)[]=[];
   let inFlight=0;const drainResolvers:(()=>void)[]=[];

   worker.onmessage=({data})=>{
    if(cancelled)return;
    if(data.error){setError(data.error);return;}
    if(data.state){
     const state=data.state as State;
     collected.push(state);collectedVisions.push(data.vision||null);
     const count=collected.length,pct=Math.min(100,Math.round(count/total*100));
     setBufferingPct(pct);
     setProgress(`Buffering video & simulating: ${pct}% (${count} / ${total})`);
     setFrames([...collected]);
     setLiveCurrent(state);
     if(data.vision)liveVision.current=data.vision;
    }
    inFlight--;
    if(drainResolvers.length>0){const next=drainResolvers.shift();next?.();}
   };
   worker.onerror=()=>{if(!cancelled){setError('Video analysis worker encountered an error.');setBuffering(false);setBusy(false);}};

   for(let i=0;i<total;i++){
    if(cancelled)break;
    const targetTime=i*dt;
    await new Promise<void>(resolve=>{
     let settled=false;
     const onSeeked=()=>{if(settled)return;settled=true;offscreen.removeEventListener('seeked',onSeeked);resolve();};
     offscreen.addEventListener('seeked',onSeeked);
     offscreen.currentTime=Math.min(d,targetTime);
     setTimeout(()=>{if(!settled){settled=true;offscreen.removeEventListener('seeked',onSeeked);resolve();}},200);
    });
    if(cancelled)break;

    ctx.drawImage(offscreen,0,0,128,80);
    const pixels=ctx.getImageData(0,0,128,80).data;

    if(inFlight>=4){
     await new Promise<void>(resolve=>drainResolvers.push(resolve));
    }
    if(cancelled)break;

    inFlight++;
    worker.postMessage({type:'frame',pixels,time:targetTime,generation:0},[pixels.buffer]);
   }

   while(inFlight>0&&!cancelled){
    await new Promise<void>(resolve=>setTimeout(resolve,20));
   }

   offscreen.pause();
   offscreen.removeAttribute('src');
   offscreen.load();
   if(offscreen.parentNode)offscreen.parentNode.removeChild(offscreen);

   if(cancelled)return;

   if(v){
    v.pause();
    if(v.readyState<3){
     await new Promise<void>(resolve=>{
      let settled=false;
      const done=()=>{if(settled)return;settled=true;v.removeEventListener('canplaythrough',done);v.removeEventListener('canplay',done);resolve();};
      v.addEventListener('canplaythrough',done);
      v.addEventListener('canplay',done);
      setTimeout(done,3000);
     });
    }
    await new Promise<void>(resolve=>{
     let settled=false;
     const onSeeked=()=>{if(settled)return;settled=true;v.removeEventListener('seeked',onSeeked);resolve();};
     v.addEventListener('seeked',onSeeked);
     v.currentTime=0;
     setTimeout(()=>{if(!settled){settled=true;v.removeEventListener('seeked',onSeeked);resolve();}},300);
    });
   }
   if(cancelled)return;

   visions.current=collectedVisions;
   setFrames([...collected]);
   setBuffering(false);setBufferingPct(100);setBusy(false);setProgress('');
   setTime(0);
   setLiveCurrent(collected[0]||null);
   if(collectedVisions[0])liveVision.current=collectedVisions[0];
   setPlaying(true);
  };

  runPreload().catch(err=>{
   if(!cancelled){setError(err instanceof Error?err.message:'Video analysis could not start.');setBuffering(false);setBusy(false);}
  });

  return()=>{
   cancelled=true;
   worker.terminate();
   const existing=document.querySelector('video[style*="-9999px"]');
   existing?.remove();
  };
 },[url,graph,params,control]);
 useEffect(()=>{
  if(url){
   if(interpreted){
    const target=visionCanvas.current?.getContext('2d');
    if(!target)return;
    const idx=Math.min(visions.current.length-1,Math.max(0,Math.round(time*20)));
    const vData=visions.current[idx];
    if(vData){
     target.putImageData(new ImageData(new Uint8ClampedArray(vData),128,80),0,0);
    }else if(liveVision.current){
     target.putImageData(new ImageData(new Uint8ClampedArray(liveVision.current),128,80),0,0);
    }
   }
   return;
  }
  if(!interpreted)return;
  const target=visionCanvas.current?.getContext('2d');
  if(!target)return;
  const off=document.createElement('canvas');off.width=128;off.height=80;
  const offCtx=off.getContext('2d',{willReadFrequently:true});
  if(!offCtx)return;
  drawStimulus(offCtx,128,80,time,preset);
  const currentPixels=offCtx.getImageData(0,0,128,80).data;
  const vision=flyVision(currentPixels,time===0?null:presetVisionRef.current);
  presetVisionRef.current=currentPixels;
  target.putImageData(new ImageData(new Uint8ClampedArray(vision),128,80),0,0);
 },[interpreted,url,time,preset]);

 const duration=url?clipDuration:12;

 useEffect(()=>{if(!playing||url)return;let last=performance.now();const timer=setInterval(()=>{const now=performance.now(),dt=(now-last)/1000;last=now;setTime(t=>{const next=t+dt*speed;if(busy&&next>(frames.at(-1)?.features.timestamp??0))return t;if(next>=duration){if(loop)return next%duration;setPlaying(false);setPanel('report');return duration;}return next;});},50);return()=>clearInterval(timer);},[playing,speed,duration,loop,url,busy,frames]);

 useEffect(()=>{if(video.current){video.current.playbackRate=speed;if(playing&&!buffering)video.current.play().catch(()=>setPlaying(false));else video.current.pause();}},[playing,speed,url,buffering]);

 useEffect(()=>{if(!playing||!url||buffering)return;const timer=setInterval(()=>{if(video.current)setTime(video.current.currentTime);},30);return()=>clearInterval(timer);},[playing,url,buffering]);

 const current=frames[Math.min(frames.length-1,Math.max(0,Math.round(time*20)))]||liveCurrent,peak=useMemo(()=>frames.reduce((best,s)=>s.score>(best?.score??-1)?s:best,frames[0]),[frames]);const high=useMemo(()=>peakActivity(frames),[frames]),average=high??0;

 const seek=(t:number)=>{if(buffering)return;const next=Math.max(0,Math.min(url||!busy?duration:frames.at(-1)?.features.timestamp??0,t));setTime(next);if(video.current)video.current.currentTime=next;};
 const inspect=useMemo(()=>graph.neurons.find(n=>n.neuron_id===selected),[graph,selected]),path=useMemo(()=>selected&&!(graph.fullModel&&control==='Shuffled wiring')?trace(runGraph,selected):[],[runGraph,selected,control,graph.fullModel]);

 function analyze(file:File){
  if(!/\.(mp4|webm|mov|m4v)$/i.test(file.name)&&!file.type.startsWith('video/')){setError('Choose an MP4, WebM, or MOV video.');if(upload.current)upload.current.value='';return;}
  if(file.size>100*1024*1024){setError('Choose a video smaller than 100 MB.');if(upload.current)upload.current.value='';return;}
  setPlaying(false);setBusy(true);setBuffering(true);setBufferingPct(0);setError('');setProgress('Buffering video…');setPanel('');setBattle(null);setFrames([]);setLiveCurrent(null);liveVision.current=null;visions.current=[];
  setUrl(URL.createObjectURL(file));setFilename(file.name);setTime(0);setSelected(null);setInterpreted(false);if(upload.current)upload.current.value='';
 }

 function clearVideo(){
  setUrl('');setFilename('');setTime(0);setSelected(null);setInterpreted(false);setFrames([]);setLiveCurrent(null);liveVision.current=null;visions.current=[];setBuffering(false);setBufferingPct(0);setError('');setProgress('');if(upload.current)upload.current.value='';
 }

 function exportData(kind='json'){if(kind==='png'){const c=document.createElement('canvas');c.width=1200;c.height=630;const ctx=c.getContext('2d')!;ctx.fillStyle='#101810';ctx.fillRect(0,0,1200,630);ctx.fillStyle='#c1ec95';ctx.font='bold 28px sans-serif';ctx.fillText('MACHIVISION / CONNECTOME LAB',60,70);ctx.font='22px sans-serif';ctx.fillText(filename||preset,60,125);ctx.font='bold 100px sans-serif';ctx.fillText(formatScore(high),60,250);ctx.font='20px sans-serif';ctx.fillText('Peak neural activity score / 100',220,225);ctx.fillText('Percentage of model neurons spiking per observation window',60,300);ctx.font='16px sans-serif';ctx.fillStyle='#a1b398';ctx.fillText(graph.synthetic?'SYNTHETIC CONNECTOME · Simulated activity':'REAL CONNECTIVITY · Simulated activity',60,555);ctx.fillText('Not a measurement of preference, enjoyment or consciousness.',60,585);const link=document.createElement('a');link.download='machivision-result.png';link.href=c.toDataURL('image/png');link.click();return;}const content=kind==='csv'?'timestamp,activity_score_0_100,dopamine_mean_depolarization_mv,dopamine_mean_rate_hz,motion,looming,active_neurons\n'+frames.map(s=>[s.features.timestamp,s.score,s.dopamineRaw??'',s.dopamineRateHz??'',s.features.motion_magnitude,s.features.looming,s.active].join(',')).join('\n'):JSON.stringify({source:graph.source,synthetic:graph.synthetic,parameters:params,control,shuffle_seed:SHUFFLE_SEED,dynamics_version:graph.fullModel?FULL_DYNAMICS_VERSION:DYNAMICS_VERSION,full_model:graph.fullModel,display_neuron_count:graph.neurons.length,active_definition:'at least one modeled spike per observation',raw_dopamine_unit:'mV above rest',plasticity:false,full_model_assumptions:graph.fullModel?{photoreceptorDriveMv:30,lightHalfSaturation:.02,receptorFilterMs:10,laminaTonicMv:12,input:'linear RGB luminance; no UV',display:'sampled neurons; aggregate measurements use full model'}:undefined,stimulus:filename||preset,activity_peak_0_100:high,dopamine_peak_depolarization_mv:peakMembrane(frames),model_id:graph.modelId,dopamine_neuron_count:graph.fullModel?.dopamineNeurons??dopamineCells.length,score_definition:"100 × spiking neurons / all simulated neurons per observation window; no novelty, reward, or per-video normalization",peak,frames},null,2);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:kind==='csv'?'text/csv':'application/json'}));a.download=`machivision-results.${kind}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

 const axisMax=100;
 const plot=(data:State[],motion=false)=>data.map((s,i)=>`${s.features.timestamp/Math.max(.05,duration)*1000},${100-(motion?s.features.motion_magnitude*100:s.score)}`).join(' ');
 const timelinePoints=useMemo(()=>plot(frames),[frames,duration,axisMax]),motionPoints=useMemo(()=>plot(frames,true),[frames,duration]),battlePoints=useMemo(()=>battle?plot(battle.frames):'',[battle,duration,axisMax]);
 const meanActivation=useMemo(()=>(current?.networkMeanRateHz??((current?.rateHz?.reduce((a,b)=>a+b,0)||0)/Math.max(1,graph.neurons.length))).toFixed(2),[current,graph]);

 useEffect(()=>{
  if(typeof window!=='undefined'){
   (window as any).__loadDemoVideo=async()=>{
    const res=await fetch('/demo/moving-dot.webm');
    const b=await res.blob();
    analyze(new File([b],'moving-dot.webm',{type:'video/webm'}));
   };
  }
 },[]);

 if(!graph.neurons.length)return (
  <div className="loading-connectome">
   <div className="loading-logo-container">
    <img src="/logo-grey.png" alt="MACHIVISION Base" className="logo-img-base"/>
    <img src="/logo-white.png" alt="MACHIVISION Fill" className="logo-img-fill"/>
   </div>
   <div className="loading-brand">MACHIVISION</div>
   {loadError&&<><h1>Real connectome unavailable</h1><p>{loadError}</p><button onClick={()=>location.reload()}>Retry</button></>}
   </div>
  );

  return <div className="app-shell"><header><a className="brand" href="/"><span className="brand-icon"><img src="/logo-blue.png" alt="MACHIVISION Logo" className="header-logo"/></span> MACHIVISION <span className="brand-divider"/> <small>CONNECTOME LAB</small></a><nav>{['Experiment','Video Battle'].map(n=><button className={tab===n?'nav-active':''} key={n} onClick={()=>setTab(n)}>{n==='Experiment'?<FlaskConical size={15}/>:<GitBranch size={15}/>} {n}</button>)}</nav></header>

  <main><div className="intro compact-intro"><div className="intro-actions"><button type="button" className="export-results" disabled={busy} onClick={()=>exportData()}><Download size={15}/> Export results</button><label className="primary upload-video" role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();upload.current?.click();}}}><Upload size={20}/> {url?'Change video':'Upload video'}<input ref={upload} id="video-file-input" type="file" accept="video/mp4,video/webm,video/*,.mp4,.webm,.mov,.m4v" style={{display:'none'}} onChange={event=>{const file=event.target.files?.[0];if(file)analyze(file);event.target.value='';}}/></label>{!url&&<button type="button" className="sample-video-btn" id="demo-video-btn" disabled={buffering} onClick={async()=>{try{setBusy(true);setProgress('Loading sample video…');const res=await fetch('/demo/moving-dot.webm');const b=await res.blob();analyze(new File([b],'moving-dot.webm',{type:'video/webm'}));}catch{setError('Could not load sample video.');setBusy(false);}}} title="Load moving dot demo video"><Play size={15}/> Sample video</button>}{url&&<button type="button" className="clear-video" onClick={clearVideo} title="Clear uploaded video and return to preset stimuli"><X size={15}/> Clear video</button>}</div></div>

 {error&&<div className="error" role="alert"><span>{error}</span><button type="button" className="icon" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}

 {tab==='Video Battle'&&<section className="battle"><div><span className="eyebrow">SAME MODEL. TWO STIMULI.</span><h2>Which video drives a stronger response?</h2><p>Capture A, then upload B. Both runs must use the same parameters.</p></div><div className="battle-actions"><button onClick={()=>setBattle({name:filename||preset,frames:[...frames],engine:'browser'})}>Capture current as A</button><label className="primary upload-battle-btn" role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(e.currentTarget.querySelector('input') as HTMLInputElement)?.click();}}}><Upload size={14}/> Upload video as B<input type="file" accept="video/mp4,video/webm,video/*,.mp4,.webm,.mov,.m4v" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)analyze(f);e.target.value='';}}/></label></div>{battle&&<div className="battle-result"><strong>A · {battle.name} <em>{formatScore(peakActivity(battle.frames))}</em></strong><strong>B · {filename||preset} <em>{formatScore(high)}</em></strong><span>Peak activity score / 100 · {average>(peakActivity(battle.frames)??0)?'B':'A'} has the larger spiking fraction.</span></div>}</section>}

  <section className="experiment-setup"><div className="experiment-controls"><label>Control <select aria-label="Experiment control" value={control} onChange={e=>{setPlaying(false);setTime(0);setBattle(null);setControl(e.target.value as Control);}}>{controls.map(c=><option key={c}>{c}</option>)}</select></label><label>Stimulus <select aria-label="Demo stimulus" disabled={!!url} value={preset} onChange={e=>{setPlaying(false);setPreset(e.target.value);}}>{presets.map(p=><option key={p}>{p}</option>)}</select></label></div><p className="experiment-coverage">{graph.fullModel?`${graph.fullModel.mappedPhotoreceptors.toLocaleString()}/${graph.fullModel.photoreceptors.toLocaleString()} photoreceptors mapped · ${graph.fullModel.neurons.toLocaleString()} simulated neurons · ${graph.neurons.length.toLocaleString()} displayed`: `${coverage.mapped}/${coverage.total} mapped T4/T5 inputs`} · Fixed synapses · {control}</p>{url&&buffering&&<p className="experiment-coverage">Buffering video &amp; simulating connectome for buffer-free playback ({bufferingPct}%)…</p>}{url&&!buffering&&frames.length>0&&<p className="experiment-coverage">Full-model simulation complete ({frames.length} observations) · Playing buffer-free at native framerate.</p>}{busy&&!buffering&&<p role="status" className="experiment-coverage">{progress} · Playback is available as results arrive.</p>}</section><div className="analysis-layout"><div className="workspace"><section className="panel stimulus"><div className="stimulus-toolbar"><div className="segmented-toggle" role="group" aria-label="Stimulus display mode"><button type="button" className={!interpreted?'selected':''} onClick={()=>setInterpreted(false)} aria-pressed={!interpreted}>Regular</button><button type="button" className={interpreted?'selected':''} onClick={()=>setInterpreted(true)} aria-pressed={interpreted}><Eye size={13}/> FlyVision</button></div><button className={overlay?'icon active':'icon'} aria-label="Toggle stimulus overlay" title="Toggle overlay crosshair" onClick={()=>setOverlay(!overlay)}><Scan size={17}/></button></div>

 <div className={`video-stage cinema-player${dragging?' dragover':''}`} ref={player} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files?.[0];if(f)analyze(f);}}><CinemaScreen>{url?<video ref={video} src={url} muted preload="auto" style={{opacity:interpreted?0:1}} onLoadedMetadata={e=>{const d=e.currentTarget.duration;if(!Number.isFinite(d)||d>120){setError('Choose a video up to 120 seconds.');setUrl('');setBuffering(false);setBusy(false);return;}setClipDuration(d);setPlaying(false);}} loop={loop} playsInline onError={()=>{setError('This video codec cannot play in your browser. Use an H.264 MP4 or VP8/VP9 WebM.');setBuffering(false);setBusy(false);}} onTimeUpdate={e=>{if(!buffering)setTime(e.currentTarget.currentTime);}} onEnded={()=>{if(!buffering){setPlaying(false);setPanel('report');}}}/>:<canvas ref={canvas} width={800} height={450} style={{display:interpreted?'none':'block'}}/>}{interpreted&&<><canvas className="fly-interpretation" ref={visionCanvas} width={128} height={80}/><span className="interpretation-label">FLYVISION · contrast &amp; motion cues</span></>}<div className="stage-vignette"/>{overlay&&<div className="crosshair"/>}{dragging&&<div className="drag-hint"><span>Drop video to analyze</span></div>}{buffering&&<div className="video-buffering-overlay" role="status" aria-live="polite"><div className="buffering-spinner"/><div className="buffering-content"><span className="buffering-eyebrow">BUFFERING &amp; SIMULATING CONNECTOME</span><strong className="buffering-pct">{bufferingPct}%</strong><div className="buffering-bar"><div className="buffering-fill" style={{width:`${bufferingPct}%`}}/></div><p className="buffering-note">Preloading all observations for buffer-free playback</p></div></div>}</CinemaScreen></div>

 <div className="transport"><button className="play" disabled={buffering||(!url&&!frames.length)} aria-label={buffering?'Buffering':playing?'Pause':'Play'} onClick={()=>setPlaying(!playing)}>{buffering?<RotateCcw size={17} className="spin-icon"/>:playing?<Pause size={17}/>:<Play size={17}/>}</button><button className="icon" disabled={buffering} aria-label="Previous frame" onClick={()=>{setPlaying(false);seek(time-.05);}}><SkipBack size={14}/></button><button className="icon" disabled={buffering} aria-label="Next frame" onClick={()=>{setPlaying(false);seek(time+.05);}}><SkipForward size={14}/></button><span className="time">{stamp(time)} <span>/ {stamp(duration)}</span></span><select aria-label="Playback speed" disabled={buffering} value={speed} onChange={e=>setSpeed(+e.target.value)}>{[.25,.5,1,2].map(s=><option key={s} value={s}>{s}×</option>)}</select><button className={loop?'icon active':'icon'} disabled={buffering} aria-label="Toggle loop" onClick={()=>setLoop(!loop)}><RotateCcw size={14}/></button><button className="icon" aria-label="Fullscreen stimulus" onClick={()=>player.current?.requestFullscreen()}><Maximize2 size={14}/></button></div><input className="seek" disabled={buffering} type="range" aria-label="Seek stimulus" min={0} max={duration} step={.05} value={time} onChange={e=>seek(+e.target.value)}/>

 <div className="feature-strip">{[['Luminance',current?.features.luminance],['Contrast',current?.features.contrast],['Optic flow',current?.features.motion_magnitude],['Expansion',current?.features.looming]].map(([label,value])=><div key={label as string}><small>{label}</small><strong>{((value as number||0)*100).toFixed(0)}<span>%</span></strong><div className="mini-meter"><i style={{width:`${(value as number||0)*100}%`}}/></div></div>)}</div></section>

 <section className="panel brain-panel"><div className="brain-toolbar"><div className="segmented">{['Front','Side','Dorsal'].map(v=><button className={view===v?'chosen':''} key={v} onClick={()=>setView(v)}>{v}</button>)}</div><button className={connections?'icon active':'icon'} aria-label="Toggle connections" onClick={()=>setConnections(!connections)}><Layers size={16}/></button></div><Brain graph={runGraph} activation={current?.activation||[]} onSelect={setSelected} view={view} connections={connections} region={region}/><div className="brain-label left">LEFT<br/><span></span></div><div className="brain-label right">RIGHT<br/><span></span></div><div className="brain-legend"><span><i/> Resting</span><span className="gradient"/><span>Active</span><small>Medulla · Lobula · Lobula plate</small></div><div className="neural-stats"><div><small title="Neurons with at least one modeled spike in this observation window.">SPIKING NEURONS</small><strong>{current?.active||0}<span> / {(graph.fullModel?.neurons??graph.neurons.length).toLocaleString()}</span></strong></div><div><small>MEAN RATE · Hz</small><strong>{meanActivation}</strong></div><div><small>{graph.fullModel?'MODEL COVERAGE':'GRAPH DEPTH LIMIT'}</small><strong>{graph.fullModel?'Full':params.hops-1}<span>{graph.fullModel?' brain':' hops'}</span></strong></div><button className="icon" aria-label="Simulation settings" disabled={busy} onClick={()=>{setDraftParams({...params});setPanel('settings');}}><SlidersHorizontal size={18}/></button></div></section></div>

 <div className="results"><section ref={resultPanel} className="panel score-panel" aria-label="Neural activity score"><div className="eyebrow"><Activity size={14}/> NEURAL ACTIVITY SCORE <span>{busy?'PARTIAL PEAK':url?'LIVE PEAK':'COMPLETE'}</span></div><div className="score-number">{formatScore(high)}<small>/100</small></div><h3>Peak percentage of neurons spiking</h3><p>100 × spiking neurons ÷ all simulated neurons in an observation window. No novelty weighting.</p><div className="score-links"><button className="text-button" disabled={busy} onClick={()=>exportData('png')}>PNG <Download size={12}/></button></div></section>

 <section className="panel response-panel"><div className="panel-title">Live neural measurements <span>{stamp(time)}</span></div><p>Dopamine-cell membrane response <strong>{formatResponse(current?.dopamineRaw)} mV above rest</strong></p><p>Dopamine-cell firing <strong>{formatResponse(current?.dopamineRateHz)} Hz</strong></p><p>Whole-network firing <strong>{meanActivation} Hz</strong></p>{current?.circuits&&<details open><summary>Visual circuit measurements</summary><p>All cells in each population · Hz per neuron</p><table style={{width:'100%',fontSize:12}}><thead><tr><th>Population</th><th>Cells</th><th>Spiking</th><th>Hz</th><th>ΔmV</th></tr></thead><tbody>{Object.entries(current.circuits).map(([name,c])=><tr key={name}><td>{name}</td><td>{c.neurons.toLocaleString()}</td><td>{c.spiking}</td><td>{formatResponse(c.meanRateHz)}</td><td>{formatResponse(c.meanDepolarizationMv)}</td></tr>)}</tbody></table><p>Tonic lamina drive can produce baseline activity without image input.</p></details>}</section>

 <section className="panel peak-panel"><div className="eyebrow"><span className="peak-star">✧</span> ACTIVITY PEAK</div><div className="peak-time">{stamp(peak?.features.timestamp||0)}<span>PEAK {formatScore(peak?.score)}</span></div><h3>{peak?.trigger||'Analyzing stimulus'}</h3><p>The largest fraction of simulated neurons spiking in an observation window.</p><button onClick={()=>{seek((peak?.features.timestamp||0)-1);setPlaying(true);}}><Play size={14}/> Watch peak moment <ArrowUpRight size={14}/></button></section></div>

 </div><details className="detailed-analysis" open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary>Explore the timeline, peak moment & neural pathways <ChevronRight size={15}/></summary><section className="panel timeline-panel"><div className="panel-head"><span><span className="section-number">03</span> Response timeline</span><div className="chart-legend"><button className="text-button" onClick={()=>{seek((peak?.features.timestamp||0)-1);setPlaying(true);}}>Watch peak moment <Play size={12}/></button><span><i/> Activity score / 100</span><button className="icon" aria-label="Export CSV" onClick={()=>exportData('csv')}><Download size={14}/></button></div></div><div className="chart"><div className="y-axis"><span>100</span><span>50</span><span>0</span></div><svg role="slider" aria-label="Response timeline seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowRight')seek(time+.5);if(e.key==='ArrowLeft')seek(time-.5);}} viewBox="0 0 1000 100" preserveAspectRatio="none" onClick={e=>{const b=e.currentTarget.getBoundingClientRect();seek((e.clientX-b.left)/b.width*duration);}}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b9e887" stopOpacity=".17"/><stop offset="1" stopColor="#b9e887" stopOpacity="0"/></linearGradient></defs>{[0,50,100].map(y=><line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#25312d" strokeDasharray="3 5"/>)}<polygon fill="url(#area)" points={`0,100 ${timelinePoints} 1000,100`}/><polyline fill="none" stroke="#bee991" strokeWidth="2" points={timelinePoints}/>{battle&&tab==='Video Battle'&&<polyline fill="none" stroke="#dcab7d" strokeWidth="2" points={battlePoints}/>}<line x1={time/duration*1000} x2={time/duration*1000} y1="0" y2="100" stroke="#e4eddf"/><circle cx={(peak?.features.timestamp||0)/duration*1000} cy={100-(peak?.score||0)} r="3" fill="#d2f6a6"/></svg></div><div className="x-axis">{Array.from({length:7},(_,i)=><span key={i}>{stamp(duration*i/6)}</span>)}</div><div className="timeline-foot"><span><i className="green-dot"/> {playing?'Playing':'Paused'} · Frame {Math.round(time*20)} · 50 ms observations · 0.2 ms integration</span><span>Click the timeline to explore a moment <ChevronRight size={13}/></span></div></section>

 <div className="bottom-grid"><section className="panel region-panel"><div className="panel-title">Annotated population activity <select aria-label="Region isolation" value={region} onChange={e=>setRegion(e.target.value)}><option>All regions</option>{Object.entries(current?.regions||{}).filter(([r])=>!['sensory','sensory_ascending','ascending','endocrine'].includes(r.toLowerCase())).map(([r])=><option key={r}>{r}</option>)}</select></div>{Object.entries(current?.regions||{}).filter(([r])=>!['sensory','sensory_ascending','ascending','endocrine'].includes(r.toLowerCase())).map(([r,a])=><button className="region-row" key={r} title={`${r}: ${(a*100).toFixed(4)}%`} onClick={()=>{setRegion(r);const match=graph.neurons.map((n,i)=>({id:n.neuron_id,act:current?.activation[i]??0,n})).filter(x=>(x.n.super_class||x.n.brain_region)===r).sort((a,b)=>b.act-a.act)[0];setSelected(match?.id||null);}}><span>{r}</span><div className="bar-track"><i style={{width:`${a>0?Math.max(2,Math.min(100,a*100)):0}%`}}/></div><b>{formatRegionActivity(r,a)}</b><ChevronRight size={13}/></button>)}</section><section className="panel inspector"><div className="panel-title">Why did this light up? <GitBranch size={16}/></div>{inspect?<><div className="inspect-heading"><strong>{inspect.neuron_id}</strong><span>{(current?.rateHz?.[graph.neurons.indexOf(inspect)]||0).toFixed(1)} Hz · {(current?.voltageMv?.[graph.neurons.indexOf(inspect)]??-52).toFixed(2)} mV · {current?.spikeCounts?.[graph.neurons.indexOf(inspect)]||0} spikes</span></div><p>{inspect.cell_type||'Cell type unavailable'} · {inspect.hemisphere} · {(!inspect.brain_region||inspect.brain_region==='Unavailable')?(inspect.super_class?inspect.super_class.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+(inspect.super_class.toLowerCase()==='central'?' brain':''):'Central brain'):inspect.brain_region}</p><svg role="img" aria-label="Selected neuron spike raster for current observation" viewBox="0 0 300 35" style={{width:"100%",height:35}}><line x1="0" x2="300" y1="28" y2="28" stroke="#7c9aca"/>{current?.spikeEvents?.filter(e=>e[0]===graph.neurons.indexOf(inspect)).map((e,i)=>{const x=300*(e[1]-(current.simulationTimeSeconds!-current.windowSeconds!))/current.windowSeconds!;return <line key={i} x1={x} x2={x} y1="5" y2="28" stroke="#bee991"/>;})}</svg><small>Spike raster · current {Math.round((current?.windowSeconds||.05)*1000)} ms observation</small><div className="path">{path.map((id,i)=><span key={id}>{i>0&&<ChevronRight size={12}/>}<button onClick={()=>setSelected(id)}>{id}</button></span>)}</div><p>{path.length?`${path.length-1} structural hops within the displayed subset; full-model paths may pass through undisplayed cells. Trigger: ${current?.trigger}.`:'No path available in this display subset/control; this does not establish disconnection in the full model.'} Neurotransmitter: {inspect.neurotransmitter||'unavailable'}.</p></>:<><div className="inspect-empty"><Scan size={28}/><div><strong>Follow the signal.</strong><p>Select a neuron in the brain or a region to trace its input pathway.</p></div></div><button className="text-button" onClick={()=>{const activeDownstream=graph.neurons.map((n,i)=>({id:n.neuron_id,act:current?.activation[i]??0,depth:n.depth})).filter(x=>x.depth>0&&x.act>0).sort((a,b)=>b.act-a.act)[0];setSelected(activeDownstream?.id||graph.neurons.find(n=>n.depth===1&&n.super_class==='descending')?.neuron_id||'720575940604954289');}}>Inspect an active pathway <ArrowUpRight size={14}/></button></>}</section></div>

 </details><footer><span><img src="/logo-blue.png" alt="MACHIVISION Logo" className="footer-logo"/> MACHIVISION</span></footer></main>

 {panel&&<div className="modal-backdrop" onClick={()=>setPanel('')}><section className="modal" role="dialog" aria-modal="true" aria-label={panel} onClick={e=>e.stopPropagation()}><button className="close" aria-label="Close dialog" onClick={()=>setPanel('')}><X size={20}/></button>{panel==='settings'?<><span className="eyebrow">EXPERIMENT PARAMETERS</span><h2>Shape the simulation.</h2>{Object.entries(draftParams).filter(([k])=>!graph.fullModel||k!=='hops').map(([k,v])=><label className="setting" key={k}>{parameterLabels[k as keyof Params]}<b>{v}</b><input disabled={!!url||busy} type="range" min={k==='hops'?1:k==='membraneMs'?10:0} max={k==='hops'?6:k==='threshold'?20:k==='input'?2:k==='membraneMs'?40:.55} step={k==='hops'||k==='threshold'||k==='membraneMs'?1:k==='synapseMv'?.025:.05} value={v} onChange={e=>setDraftParams(prev=>({...prev,[k]:+e.target.value}))}/></label>)}<p>Changes recompute the complete demo timeline. Live videos retain their playback parameters.</p><div className="modal-actions"><button className="primary" disabled={!!url||busy} onClick={()=>{setPlaying(false);setBattle(null);setParams({...draftParams});setPanel('');}}>Save changes</button><button disabled={!!url||busy} onClick={()=>setDraftParams({...defaults,threshold:graph.fullModel?1:defaults.threshold})}>Reset defaults</button></div></>:panel==='score'?<><span className="eyebrow">TRANSPARENT MODEL</span><h2>Neural activity score.</h2><p>We report population-mean positive membrane depolarization in mV and firing rate in Hz separately. The membrane response includes subthreshold input; a positive value does not imply dopamine-cell spikes or dopamine release. The activity score is 100 times the fraction of all simulated neurons that spike during an observation. Its axis stays fixed at 0–100 for every experiment. It has no novelty weighting and is not normalized to each clip’s maximum. Compare equal observation windows and parameters.</p><p>Annotations include known and predicted neurotransmitters. This is a signed connectome-model proxy, not dopamine concentration, release, pleasure or a biological measurement. Area glow does not change this score. Skipping or seeking leaves unseen frames unanalyzed and resets propagation across the jump. The interpretation toggle displays coarse luminance, contrast and temporal-change cues, not a reconstructed subjective view.</p></>:panel==='report'?<><span className="eyebrow">ANALYSIS COMPLETE</span><h2>{filename||preset}</h2><div className="final-score">{formatScore(high)}<small>/100</small></div><h3>Peak neural activity score</h3><p>Percentage of simulated neurons that spike in the peak observation window. Raw dopamine-cell mV and Hz measurements are reported separately.</p><button className="primary" onClick={()=>exportData()}>Export experiment report</button></>:<><span className="eyebrow">SCIENCE, WITH CONTEXT</span><h2>Wiring is not activity.</h2><p>Real anatomical neuropil surfaces brighten with the strongest modeled activity among their nearest neuron anchors. Nearest-surface association is a display approximation, not verified neuropil membership. Scores and neuron inspection use individual activity. The anatomical view samples neurons and shows at most 18,000 connection lines. The full model independently simulates all annotated neurons and all source connections meeting the selected synapse threshold. The connectome describes anatomical connectivity between neurons. It does not directly record electrical activity. Neural activity shown in MACHIVISION is computationally simulated using luminance delivered to mapped photoreceptors, tonic lamina drive, and fixed connectivity.</p><p><strong>{graph.synthetic?'This session uses synthetic connectivity and abstract geometry. No neuron shown is claimed to be a real biological identity.':graph.source}</strong></p><p>These measurements summarize simulated activity in dopamine-annotated neurons. It does not represent preference, enjoyment, emotion, awareness, or consciousness.</p><a href="/methodology">Read the methodology ↗</a></>}</section></div>}



 </div>;

}
