'use client';

import {useState,useEffect,useRef,useMemo} from 'react';

import {Activity,ArrowUpRight,Play,Pause,Upload,RotateCcw,Maximize2,ChevronRight,Download,SlidersHorizontal,Scan,BrainCircuit,Layers,SkipBack,SkipForward,X,GitBranch,FlaskConical,Eye} from 'lucide-react';

import {dopamineIndices,dopamineActivity,dopamineHigh,formatDopamine} from '@/lib/dopamine';
import {unpackGraph} from '@/lib/graph-wire';
import Brain from '@/components/Brain';
import CinemaScreen from '@/components/CinemaScreen';

import {defaults,drawStimulus,trace,State,Params,Graph,ResponseCalibration} from '@/lib/model';
import {flyVision} from '@/lib/fly-vision';

const stamp=(t:number)=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;

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

 const [graph,setGraph]=useState<Graph>({source:'Loading real connectome',synthetic:false,neurons:[],connections:[]}),[preset]=useState('Looming object'),[frames,setFrames]=useState<State[]>([]),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[loop,setLoop]=useState(false),[params,setParams]=useState<Params>(defaults),[draftParams,setDraftParams]=useState<Params>(defaults),[view,setView]=useState('Front'),[connections,setConnections]=useState(false),[region,setRegion]=useState('All regions'),[selected,setSelected]=useState<string|null>(null),[tab,setTab]=useState('Experiment'),[panel,setPanel]=useState(''),[url,setUrl]=useState(''),[filename,setFilename]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[battle,setBattle]=useState<{name:string;frames:State[];engine:string}|null>(null),[overlay,setOverlay]=useState(true),[progress,setProgress]=useState(''),[loadError,setLoadError]=useState(''),[clipDuration,setClipDuration]=useState(12),[detailsOpen,setDetailsOpen]=useState(true);

 const [interpreted,setInterpreted]=useState(false),[liveCurrent,setLiveCurrent]=useState<State|null>(null),[calibration,setCalibration]=useState<ResponseCalibration|null>(null);
 const visionCanvas=useRef<HTMLCanvasElement>(null),liveVision=useRef<Uint8ClampedArray|null>(null),presetVisionRef=useRef<Uint8ClampedArray|null>(null);
 const dopamineCells=useMemo(()=>dopamineIndices(graph),[graph]);
 const canvas=useRef<HTMLCanvasElement>(null),video=useRef<HTMLVideoElement>(null),upload=useRef<HTMLInputElement>(null),player=useRef<HTMLDivElement>(null),resultPanel=useRef<HTMLElement>(null);

 useEffect(()=>{const controller=new AbortController();fetch('/api/connectome?compact=1',{signal:controller.signal}).then(async r=>{const g=await r.json();if(!r.ok||g.synthetic||g.error)throw Error(g.error||'Real data is required.');setGraph(unpackGraph(g));}).catch(e=>{if(e.name!=='AbortError')setLoadError(e.message);});return()=>controller.abort();},[]);

 useEffect(()=>{
  if(url||!graph.neurons.length)return;
  setBusy(true);setProgress('Preparing neural activity…');
  const worker=new Worker(new URL('../lib/simulation.worker.ts',import.meta.url));
  worker.onmessage=({data})=>{if(data.error)setError(data.error);else{setFrames(data.frames);setCalibration(data.calibration);setTime(0);}setBusy(false);setProgress('');worker.terminate();};
  worker.onerror=()=>{setError('Could not prepare the simulation. Please reload.');setBusy(false);setProgress('');worker.terminate();};
  worker.postMessage({graph,params,preset});return()=>worker.terminate();
 },[preset,params,graph,url]);

 useEffect(()=>{if(!url&&canvas.current)drawStimulus(canvas.current.getContext('2d')!,800,450,time,preset);},[time,preset,url,graph]);

 useEffect(()=>{if(!url)return;return()=>URL.revokeObjectURL(url);},[url]);
 useEffect(()=>{
  if(!url||!graph.neurons.length)return;
  const worker=new Worker(new URL('../lib/live.worker.ts',import.meta.url));
  const sample=document.createElement('canvas');sample.width=128;sample.height=80;const ctx=sample.getContext('2d',{willReadFrequently:true})!;
  let ready=false,pending=false,lastTime=-1,cancelled=false;
  const capture=()=>{const v=video.current;if(!ready||pending||!v||v.readyState<2||v.seeking||v.currentTime===lastTime)return;
   lastTime=v.currentTime;pending=true;ctx.drawImage(v,0,0,128,80);const pixels=ctx.getImageData(0,0,128,80).data;
   worker.postMessage({type:'frame',pixels,time:lastTime},[pixels.buffer]);
  };
  worker.onmessage=({data})=>{if(cancelled)return;if(data.ready){ready=true;setCalibration(data.calibration);capture();return;}pending=false;
   if(data.error){setError(data.error);return;}const state=data.state as State;setLiveCurrent(state);
   setFrames(old=>{const bucket=Math.round(state.features.timestamp*20),index=old.findIndex(f=>Math.round(f.features.timestamp*20)===bucket);if(index<0)return [...old,state].sort((a,b)=>a.features.timestamp-b.features.timestamp);if((old[index].dopamine??0)>=(state.dopamine??0))return old;const next=[...old];next[index]=state;return next;});
   liveVision.current=data.vision;const target=visionCanvas.current?.getContext('2d');if(target)target.putImageData(new ImageData(new Uint8ClampedArray(data.vision),128,80),0,0);
  };
  worker.onerror=()=>{pending=false;setError('Live analysis could not start. Please reload.');};
  worker.postMessage({type:'init',graph,params});const timer=setInterval(capture,50);
  return()=>{cancelled=true;clearInterval(timer);worker.terminate();};
 },[url,graph,params]);
 useEffect(()=>{
  if(url){
   if(interpreted&&liveVision.current)visionCanvas.current?.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(liveVision.current),128,80),0,0);
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

 useEffect(()=>{if(!playing||url)return;let last=performance.now();const timer=setInterval(()=>{const now=performance.now(),dt=(now-last)/1000;last=now;setTime(t=>{const next=t+dt*speed;if(next>=duration){if(loop)return next%duration;setPlaying(false);setPanel('report');return duration;}return next;});},50);return()=>clearInterval(timer);},[playing,speed,duration,loop,url]);

 useEffect(()=>{if(video.current){video.current.playbackRate=speed;if(playing)video.current.play().catch(()=>setPlaying(false));else video.current.pause();}},[playing,speed,url]);

 useEffect(()=>{if(!playing||!url)return;const timer=setInterval(()=>{if(video.current)setTime(video.current.currentTime);},50);return()=>clearInterval(timer);},[playing,url]);

 const current=url?liveCurrent:frames[Math.min(frames.length-1,Math.max(0,Math.round(time*20)))],peak=useMemo(()=>frames.reduce((best,s)=>(s.dopamine??-1)>(best?.dopamine??-1)?s:best,frames[0]),[frames]);const high=useMemo(()=>dopamineHigh(frames),[frames]),average=high??0;

 const seek=(t:number)=>{const next=Math.max(0,Math.min(duration,t));setTime(next);if(video.current)video.current.currentTime=next;};
 const inspect=useMemo(()=>graph.neurons.find(n=>n.neuron_id===selected),[graph,selected]),path=useMemo(()=>selected?trace(graph,selected):[],[graph,selected]);

 function analyze(file:File){
  if(!/\.(mp4|webm)$/i.test(file.name)){setError('Choose an MP4 or WebM video.');return;}
  if(file.size>100*1024*1024){setError('Choose a video smaller than 100 MB.');return;}
  setPlaying(false);setBusy(false);setError('');setProgress('');setPanel('');setBattle(null);setFrames([]);setLiveCurrent(null);liveVision.current=null;
  setUrl(URL.createObjectURL(file));setFilename(file.name);setTime(0);setSelected(null);setInterpreted(false);if(upload.current)upload.current.value='';
 }

 function exportData(kind='json'){if(kind==='png'){const c=document.createElement('canvas');c.width=1200;c.height=630;const ctx=c.getContext('2d')!;ctx.fillStyle='#101810';ctx.fillRect(0,0,1200,630);ctx.fillStyle='#c1ec95';ctx.font='bold 28px sans-serif';ctx.fillText('MACHIVISION / CONNECTOME LAB',60,70);ctx.font='22px sans-serif';ctx.fillText(filename||preset,60,125);ctx.font='bold 100px sans-serif';ctx.fillText(formatDopamine(high),60,250);ctx.font='20px sans-serif';ctx.fillText('Dopamine high / 100',220,225);ctx.fillText('Peak dopamine response · reference index',60,300);ctx.font='16px sans-serif';ctx.fillStyle='#a1b398';ctx.fillText(graph.synthetic?'SYNTHETIC CONNECTOME · Simulated activity':'REAL CONNECTIVITY · Simulated activity',60,555);ctx.fillText('Not a measurement of preference, enjoyment or consciousness.',60,585);const link=document.createElement('a');link.download='machivision-result.png';link.href=c.toDataURL('image/png');link.click();return;}const content=kind==='csv'?'timestamp,dopamine_response_index,dopamine_raw_activity,visual_model_score,motion,looming,active_neurons\n'+frames.map(s=>[s.features.timestamp,s.dopamine??'',s.dopamineRaw??'',s.score,s.features.motion_magnitude,s.features.looming,s.active].join(',')).join('\n'):JSON.stringify({source:graph.source,synthetic:graph.synthetic,parameters:params,stimulus:filename||preset,dopamine_high:high,calibration,model_id:graph.modelId,dopamine_neuron_count:dopamineCells.length,score_definition:"Maximum reference-normalized dopamine response index; raw mean modeled activity retained as dopamineRaw; not measured dopamine release",peak,frames},null,2);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:kind==='csv'?'text/csv':'application/json'}));a.download=`machivision-results.${kind}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

 const plot=(data:State[],motion=false)=>data.map((s,i)=>`${s.features.timestamp/Math.max(.05,duration)*1000},${100-(motion?s.features.motion_magnitude*100:s.dopamine??0)}`).join(' ');
 const timelinePoints=useMemo(()=>plot(frames),[frames,duration]),motionPoints=useMemo(()=>plot(frames,true),[frames,duration]),battlePoints=useMemo(()=>battle?plot(battle.frames):'',[battle,duration]);
 const meanActivation=useMemo(()=>((current?.activation.reduce((a,b)=>a+b,0)||0)/Math.max(1,graph.neurons.length)).toFixed(2),[current,graph]);

 if(!graph.neurons.length||(!frames.length&&!url&&!loadError))return (
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

 <main><div className="intro compact-intro"><div className="intro-actions"><button disabled={busy} onClick={()=>exportData()}><Download size={15}/> Export results</button><button className="primary" disabled={busy} onClick={()=>upload.current?.click()}><Upload size={15}/> Upload video</button></div></div>

 {tab==='Video Battle'&&<section className="battle"><div><span className="eyebrow">SAME MODEL. TWO STIMULI.</span><h2>Which video drives a stronger response?</h2><p>Capture A, then upload B. Both runs must use the same parameters.</p></div><button onClick={()=>setBattle({name:filename||preset,frames:[...frames],engine:'browser'})}>Capture current as A</button>{battle&&<div className="battle-result"><strong>A · {battle.name} <em>{formatDopamine(dopamineHigh(battle.frames))}</em></strong><strong>B · {filename||preset} <em>{formatDopamine(high)}</em></strong><span>Peak modeled dopamine activity · {average>(dopamineHigh(battle.frames)??0)?'B':'A'} produces higher modeled dopamine peak.</span></div>}</section>}

 <div className="analysis-layout"><div className="workspace"><section className="panel stimulus"><div className="stimulus-toolbar"><div className="segmented-toggle" role="group" aria-label="Stimulus display mode"><button type="button" className={!interpreted?'selected':''} onClick={()=>setInterpreted(false)} aria-pressed={!interpreted}>Regular</button><button type="button" className={interpreted?'selected':''} onClick={()=>setInterpreted(true)} aria-pressed={interpreted}><Eye size={13}/> FlyVision</button></div><button className={overlay?'icon active':'icon'} aria-label="Toggle stimulus overlay" title="Toggle overlay crosshair" onClick={()=>setOverlay(!overlay)}><Scan size={17}/></button></div>

 <div className="video-stage cinema-player" ref={player}><CinemaScreen>{url?<video ref={video} src={url} muted style={{opacity:interpreted?0:1}} onLoadedMetadata={e=>{const d=e.currentTarget.duration;if(!Number.isFinite(d)||d>120){setError('Choose a video up to 120 seconds.');setUrl('');return;}setClipDuration(d);setPlaying(true);}} loop={loop} playsInline onError={()=>setError('This video codec cannot play in your browser. Use an H.264 MP4 or VP8/VP9 WebM.')} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onEnded={()=>{setPlaying(false);setPanel('report');}}/>:<canvas ref={canvas} width={800} height={450} style={{display:interpreted?'none':'block'}}/>}{interpreted&&<><canvas className="fly-interpretation" ref={visionCanvas} width={128} height={80}/><span className="interpretation-label">FLYVISION · contrast &amp; motion cues</span></>}<div className="stage-vignette"/>{overlay&&<div className="crosshair"/>}{busy&&<div className="busy" role="status"><span>{progress||'Analyzing frames…'}</span><small>MP4 / WebM · up to 120 seconds</small></div>}</CinemaScreen></div>

 <div className="transport"><button className="play" disabled={busy} aria-label={playing?'Pause':'Play'} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={17}/>:<Play size={17}/>}</button><button className="icon" aria-label="Previous frame" onClick={()=>{setPlaying(false);seek(time-.05);}}><SkipBack size={14}/></button><button className="icon" aria-label="Next frame" onClick={()=>{setPlaying(false);seek(time+.05);}}><SkipForward size={14}/></button><span className="time">{stamp(time)} <span>/ {stamp(duration)}</span></span><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(+e.target.value)}>{[.25,.5,1,2].map(s=><option key={s} value={s}>{s}×</option>)}</select><button className={loop?'icon active':'icon'} aria-label="Toggle loop" onClick={()=>setLoop(!loop)}><RotateCcw size={14}/></button><button className="icon" aria-label="Fullscreen stimulus" onClick={()=>player.current?.requestFullscreen()}><Maximize2 size={14}/></button></div><input className="seek" type="range" aria-label="Seek stimulus" min={0} max={duration} step={.05} value={time} onChange={e=>seek(+e.target.value)}/>

 <div className="feature-strip">{[['Luminance',current?.features.luminance],['Contrast',current?.features.contrast],['Optic flow',current?.features.motion_magnitude],['Expansion',current?.features.looming]].map(([label,value])=><div key={label as string}><small>{label}</small><strong>{((value as number||0)*100).toFixed(0)}<span>%</span></strong><div className="mini-meter"><i style={{width:`${(value as number||0)*100}%`}}/></div></div>)}</div></section>

 <section className="panel brain-panel"><div className="brain-toolbar"><div className="segmented">{['Front','Side','Dorsal'].map(v=><button className={view===v?'chosen':''} key={v} onClick={()=>setView(v)}>{v}</button>)}</div><button className={connections?'icon active':'icon'} aria-label="Toggle connections" onClick={()=>setConnections(!connections)}><Layers size={16}/></button></div><Brain graph={graph} activation={time>0?current?.activation||[]:[]} onSelect={setSelected} view={view} connections={connections} region={region}/><div className="brain-label left">LEFT<br/><span></span></div><div className="brain-label right">RIGHT<br/><span></span></div><div className="brain-legend"><span><i/> Resting</span><span className="gradient"/><span>Active</span><small>Medulla · Lobula · Lobula plate</small></div><div className="neural-stats"><div><small>ACTIVE NEURONS</small><strong>{current?.active||0}<span> / {graph.neurons.length}</span></strong></div><div><small>MEAN ACTIVATION</small><strong>{meanActivation}</strong></div><div><small>PROPAGATION</small><strong>{params.hops-1}<span> hops</span></strong></div><button className="icon" aria-label="Simulation settings" disabled={busy} onClick={()=>{setDraftParams({...params});setPanel('settings');}}><SlidersHorizontal size={18}/></button></div></section></div>

 <div className="results"><section ref={resultPanel} className="panel score-panel" aria-label="Dopamine high"><div className="eyebrow"><Activity size={14}/> DOPAMINE HIGH <span>{busy?'PREPARING':url?'LIVE PEAK':'COMPLETE'}</span></div><div className="score-number">{busy?'—':formatDopamine(high)}<small>/100</small><svg viewBox="0 0 100 60"><path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="#253932" strokeWidth="5"/><path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="#c2ed91" strokeWidth="5" pathLength="100" strokeDasharray={`${average} 100`}/></svg></div><h3>Peak dopamine response · reference index</h3><div className="score-links"><button className="text-button" disabled={busy} onClick={()=>exportData('png')}>PNG <Download size={12}/></button></div></section>

 <section className="panel response-panel"><div className="panel-title">Live metrics <span>{stamp(time)}</span></div><div className="dopamine-meter"><div><strong>Dopamine response</strong><b>{current?.dopamine==null?'N/A':formatDopamine(current.dopamine)}<small> /100</small></b></div><div className="dopamine-track" role="progressbar" aria-label="Dopamine response index" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current?.dopamine??undefined}><i style={{width:`${current?.dopamine??0}%`}}/></div></div></section>

 <section className="panel peak-panel"><div className="eyebrow"><span className="peak-star">✧</span> DOPAMINE PEAK</div><div className="peak-time">{stamp(peak?.features.timestamp||0)}<span>PEAK {peak?.dopamine?.toFixed(1)??'N/A'}</span></div><h3>{peak?.trigger||'Analyzing stimulus'}</h3><p>The highest reference-normalized response in this stimulus.</p><button onClick={()=>{seek((peak?.features.timestamp||0)-1);setPlaying(true);}}><Play size={14}/> Watch peak moment <ArrowUpRight size={14}/></button></section></div>

 </div><details className="detailed-analysis" open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary>Explore the timeline, peak moment & neural pathways <ChevronRight size={15}/></summary><section className="panel timeline-panel"><div className="panel-head"><span><span className="section-number">03</span> Response timeline</span><div className="chart-legend"><button className="text-button" onClick={()=>{seek((peak?.features.timestamp||0)-1);setPlaying(true);}}>Watch peak moment <Play size={12}/></button><span><i/> Dopamine activity</span><span><i style={{background:'#7c9aca'}}/> Motion</span><button className="icon" aria-label="Export CSV" onClick={()=>exportData('csv')}><Download size={14}/></button></div></div><div className="chart"><div className="y-axis"><span>100</span><span>50</span><span>0</span></div><svg role="slider" aria-label="Response timeline seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowRight')seek(time+.5);if(e.key==='ArrowLeft')seek(time-.5);}} viewBox="0 0 1000 100" preserveAspectRatio="none" onClick={e=>{const b=e.currentTarget.getBoundingClientRect();seek((e.clientX-b.left)/b.width*duration);}}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b9e887" stopOpacity=".17"/><stop offset="1" stopColor="#b9e887" stopOpacity="0"/></linearGradient></defs>{[0,50,100].map(y=><line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#25312d" strokeDasharray="3 5"/>)}<polygon fill="url(#area)" points={`0,100 ${timelinePoints} 1000,100`}/><polyline fill="none" stroke="#bee991" strokeWidth="2" points={timelinePoints}/><polyline fill="none" stroke="#7c9aca" strokeWidth="1" points={motionPoints}/>{battle&&tab==='Video Battle'&&<polyline fill="none" stroke="#dcab7d" strokeWidth="2" points={battlePoints}/>}<line x1={time/duration*1000} x2={time/duration*1000} y1="0" y2="100" stroke="#e4eddf"/><circle cx={(peak?.features.timestamp||0)/duration*1000} cy={100-(peak?.dopamine||0)} r="3" fill="#d2f6a6"/></svg></div><div className="x-axis">{Array.from({length:7},(_,i)=><span key={i}>{stamp(duration*i/6)}</span>)}</div><div className="timeline-foot"><span><i className="green-dot"/> {playing?'Playing':'Paused'} · Frame {Math.round(time*20)} · 50 ms model timestep</span><span>Click the timeline to explore a moment <ChevronRight size={13}/></span></div></section>

 <div className="bottom-grid"><section className="panel region-panel"><div className="panel-title">Annotated population activity <select aria-label="Region isolation" value={region} onChange={e=>setRegion(e.target.value)}><option>All regions</option>{Object.entries(current?.regions||{}).filter(([r])=>!['sensory','sensory_ascending','ascending','endocrine'].includes(r.toLowerCase())).map(([r])=><option key={r}>{r}</option>)}</select></div>{Object.entries(current?.regions||{}).filter(([r])=>!['sensory','sensory_ascending','ascending','endocrine'].includes(r.toLowerCase())).map(([r,a])=><button className="region-row" key={r} title={`${r}: ${(a*100).toFixed(4)}%`} onClick={()=>{setRegion(r);const match=graph.neurons.map((n,i)=>({id:n.neuron_id,act:current?.activation[i]??0,n})).filter(x=>(x.n.super_class||x.n.brain_region)===r).sort((a,b)=>b.act-a.act)[0];setSelected(match?.id||null);}}><span>{r}</span><div className="bar-track"><i style={{width:`${a>0?Math.max(2,Math.min(100,a*100)):0}%`}}/></div><b>{formatRegionActivity(r,a)}</b><ChevronRight size={13}/></button>)}</section><section className="panel inspector"><div className="panel-title">Why did this light up? <GitBranch size={16}/></div>{inspect?<><div className="inspect-heading"><strong>{inspect.neuron_id}</strong><span>{(current?.activation[graph.neurons.indexOf(inspect)]||0).toFixed(3)} activation{(current?.activation[graph.neurons.indexOf(inspect)]||0)===0?' (inhibited / resting)':''}</span></div><p>{inspect.cell_type||'Cell type unavailable'} · {inspect.hemisphere} · {(!inspect.brain_region||inspect.brain_region==='Unavailable')?(inspect.super_class?inspect.super_class.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+(inspect.super_class.toLowerCase()==='central'?' brain':''):'Central brain'):inspect.brain_region}</p><div className="path">{path.map((id,i)=><span key={id}>{i>0&&<ChevronRight size={12}/>}<button onClick={()=>setSelected(id)}>{id}</button></span>)}</div><p>{path.length?`${path.length-1} graph-derived hops from visual input. Trigger: ${current?.trigger}.`:'No visual-input path found.'} Neurotransmitter: {inspect.neurotransmitter||'unavailable'}.</p></>:<><div className="inspect-empty"><Scan size={28}/><div><strong>Follow the signal.</strong><p>Select a neuron in the brain or a region to trace its input pathway.</p></div></div><button className="text-button" onClick={()=>{const activeDownstream=graph.neurons.map((n,i)=>({id:n.neuron_id,act:current?.activation[i]??0,depth:n.depth})).filter(x=>x.depth>0&&x.act>0).sort((a,b)=>b.act-a.act)[0];setSelected(activeDownstream?.id||graph.neurons.find(n=>n.depth===1&&n.super_class==='descending')?.neuron_id||'720575940604954289');}}>Inspect an active pathway <ArrowUpRight size={14}/></button></>}</section></div>

 </details><footer><span><img src="/logo-blue.png" alt="MACHIVISION Logo" className="footer-logo"/> MACHIVISION</span></footer></main>

 {panel&&<div className="modal-backdrop" onClick={()=>setPanel('')}><section className="modal" role="dialog" aria-modal="true" aria-label={panel} onClick={e=>e.stopPropagation()}><button className="close" aria-label="Close dialog" onClick={()=>setPanel('')}><X size={20}/></button>{panel==='settings'?<><span className="eyebrow">EXPERIMENT PARAMETERS</span><h2>Shape the simulation.</h2>{Object.entries(draftParams).map(([k,v])=><label className="setting" key={k}>{k}<b>{v}</b><input disabled={!!url||busy} type="range" min={k==='hops'?1:0} max={k==='hops'?6:k==='threshold'?20:k==='input'?2:.95} step={k==='hops'||k==='threshold'?1:.05} value={v} onChange={e=>setDraftParams(prev=>({...prev,[k]:+e.target.value}))}/></label>)}<p>Changes recompute the complete demo timeline. Live videos retain their playback parameters.</p><div className="modal-actions"><button className="primary" disabled={!!url||busy} onClick={()=>{setPlaying(false);setBattle(null);setParams({...draftParams});setPanel('');}}>Save changes</button><button disabled={!!url||busy} onClick={()=>setDraftParams({...defaults})}>Reset defaults</button></div></>:panel==='score'?<><span className="eyebrow">TRANSPARENT MODEL</span><h2>Dopamine high.</h2><p>The live bar scales the mean modeled activity of dopamine-positive neurons against six fixed visual reference inputs. Blank input is 0; the strongest reference response is 100. The same reference applies across videos using this graph and settings. Raw activity and reference values are included in exports. Live playback samples at up to 20 Hz. The final result records the maximum over sampled playback frames, at {stamp(peak?.features.timestamp||0)}.</p><p>Annotations include known and predicted neurotransmitters. This is a signed connectome-model proxy, not dopamine concentration, release, pleasure or a biological measurement. Area glow does not change this score. Skipping or seeking leaves unseen frames unanalyzed and resets propagation across the jump. The interpretation toggle displays coarse luminance, contrast and temporal-change cues, not a reconstructed subjective view.</p></>:panel==='report'?<><span className="eyebrow">ANALYSIS COMPLETE</span><h2>{filename||preset}</h2><div className="final-score">{formatDopamine(high)}<small>/100</small></div><h3>Dopamine high</h3><p>Peak dopamine response · reference index in sampled playback frames; not measured dopamine release.</p><button className="primary" onClick={()=>exportData()}>Export experiment report</button></>:<><span className="eyebrow">SCIENCE, WITH CONTEXT</span><h2>Wiring is not activity.</h2><p>Real anatomical neuropil surfaces brighten with the strongest modeled activity among their nearest neuron anchors. Nearest-surface association is a display approximation, not verified neuropil membership. Scores and neuron inspection use individual activity. The faint lines show the 18,000 strongest connections for readability; the simulation uses all retained connections. The connectome describes anatomical connectivity between neurons. It does not directly record electrical activity. Neural activity shown in MACHIVISION is computationally simulated using visual stimulus features, selected sensory input populations, and connectivity.</p><p><strong>{graph.synthetic?'This session uses synthetic connectivity and abstract geometry. No neuron shown is claimed to be a real biological identity.':graph.source}</strong></p><p>The dopamine score summarizes simulated activity in dopamine-annotated neurons. It does not represent preference, enjoyment, emotion, awareness, or consciousness.</p><a href="/methodology">Read the methodology ↗</a></>}</section></div>}

 {busy&&frames.length>0&&(
  <div className="loading-connectome updating-overlay">
   <div className="loading-logo-container">
    <img src="/logo-grey.png" alt="MACHIVISION Base" className="logo-img-base"/>
    <img src="/logo-white.png" alt="MACHIVISION Fill" className="logo-img-fill"/>
   </div>
   <div className="loading-brand">MACHIVISION</div>
  </div>
 )}

 </div>;

}
