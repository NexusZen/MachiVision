import json
import os
import re
import tempfile
import time
import uuid
import subprocess
from functools import lru_cache
from pathlib import Path
import imageio_ffmpeg
from fastapi import FastAPI, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from backend.engine import ROOT, RealConnectomeAdapter, analyze_video, trace_path

app=FastAPI(title='FlyVision real-connectome analysis',version='0.2.0')
MEDIA=ROOT/'data'/'uploads'
MEDIA.mkdir(parents=True,exist_ok=True)

@lru_cache(maxsize=1)
def graph():
    return RealConnectomeAdapter(os.getenv('CONNECTOME_PATH',str(ROOT/'data/processed/visual_subgraph.json'))).load()

@app.get('/api/health')
def health():return {'status':'ok','source':graph()['source'],'synthetic':False,'neurons':len(graph()['neurons'])}

@app.get('/api/connectome')
def connectome():return graph()

@app.get('/api/neuron/{neuron_id}')
def neuron(neuron_id:str):
    g=graph();n=next((n for n in g['neurons'] if n['neuron_id']==neuron_id),None)
    if n is None:raise HTTPException(404,'Unknown neuron')
    return {**n,'upstream':[e for e in g['connections'] if e['post_neuron']==neuron_id],'downstream':[e for e in g['connections'] if e['pre_neuron']==neuron_id]}

@app.get('/api/pathway/{neuron_id}')
def pathway(neuron_id:str):return {'path':trace_path(graph(),neuron_id)}

@app.get('/api/media/{media_id}')
def media(media_id:str):
    if not re.fullmatch('[a-f0-9]{32}',media_id):raise HTTPException(404,'Unknown video')
    path=MEDIA/f'{media_id}.mp4'
    if not path.is_file():raise HTTPException(404,'Video expired; upload it again')
    return FileResponse(path,media_type='video/mp4')

def process_video(path,parameters):
    result=analyze_video(path,graph(),parameters)
    media_id=uuid.uuid4().hex;target=MEDIA/f'{media_id}.mp4'
    try:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-i',str(path),'-t','120','-map','0:v:0','-an','-vf',"scale=w='min(1280,iw)':h=-2",'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(target)],check=True,timeout=180,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    except (subprocess.SubprocessError,OSError) as exc:
        target.unlink(missing_ok=True)
        raise ValueError('The video was analyzed but could not be prepared for browser playback.') from exc
    for old in MEDIA.glob('*.mp4'):
        if old.stat().st_mtime<time.time()-86400:old.unlink(missing_ok=True)
    result['media_url']=f'/api/media/{media_id}'
    result['overall_score']=round(result['dopamine_high'],1) if result['dopamine_high'] is not None else None
    result['score_label']='Dopamine high — peak reference-normalized response index'
    return result

@app.post('/api/video/analyze')
async def analyze(file:UploadFile,parameters:str=Form('{}')):
    if Path(file.filename or '').suffix.lower() not in ('.mp4','.webm'):raise HTTPException(415,'Choose MP4 or WebM')
    path=None
    try:
        settings=json.loads(parameters)
        if not isinstance(settings,dict) or set(settings)-{'decay','gain','input_gain','threshold','hops'}:raise ValueError('Invalid simulation parameters')
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename).suffix,delete=False) as out:
            path=Path(out.name);size=0
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>100*1024*1024:raise HTTPException(413,'Maximum upload size is 100 MB')
                out.write(chunk)
        return await run_in_threadpool(process_video,path,settings)
    except (ValueError,TypeError) as exc:raise HTTPException(422,str(exc)) from exc
    finally:
        if path:path.unlink(missing_ok=True)
        await file.close()
