"""Feature-domain references matching lib/response-calibration.ts."""
import re
import numpy as np
from backend.engine import Simulator

VERSION='visual-reference-v4-depolarization'
NAMES=['Blank baseline','Sustained contrast','Motion pulse','Looming pulse','Brightness transitions','Combined visual drive']

def reference_features(name,step):
    f=dict(timestamp=step*.05,luminance=.5,contrast=0,temporal_change=0,motion_x=0,motion_y=0,motion_magnitude=0,looming=0,flicker=0,left_field_activity=0,right_field_activity=0,scene_change=0,edge_density=0)
    on=10<=step<70
    if name=='Sustained contrast' and on:f['contrast']=1
    if name=='Motion pulse' and on:f.update(motion_x=1,motion_magnitude=1,contrast=1,temporal_change=.3)
    if name=='Looming pulse' and on:f.update(looming=1,contrast=1,temporal_change=.3)
    if name=='Brightness transitions' and on:
        if step%10==0:f.update(temporal_change=1,flicker=1,luminance_on=1)
        if step%10==2:f.update(temporal_change=1,flicker=1,luminance_off=1)
    if name=='Combined visual drive' and on:f.update(motion_x=1,motion_magnitude=1,looming=1,contrast=1,temporal_change=1)
    f['left_field_activity']=f['right_field_activity']=max(f['motion_magnitude'],f['looming'],f['temporal_change'])
    return f

def response_index(raw,c):
    if raw is None or not np.isfinite(raw) or c['reference']<=c['baseline']+1e-12:return None
    return 100*float(np.clip((raw-c['baseline'])/(c['reference']-c['baseline']),0,1))

def calibration_for(graph,parameters):
    p=dict(membraneMs=20,synapseMv=.275,input=1,threshold=5,hops=6)
    p.update({('input' if k=='input_gain' else k):v for k,v in parameters.items()})
    c=graph.get('responseCalibration')
    if c and c['version']==VERSION and c['graphId']==graph['modelId'] and c['parameters']==p:return c
    ids=[i for i,n in enumerate(graph['neurons']) if any(s.strip().lower() in ('da','dopamine') for s in re.split('[;,]',n.get('neurotransmitter') or ''))]
    references=[]
    for name in NAMES:
        sim=Simulator(graph,**{('input_gain' if k=='input' else k):v for k,v in p.items()})
        peak=0
        for step in range(90):
            state=sim.step(reference_features(name,step))
            peak=max(peak,float(np.asarray(state["depolarizationMv"])[ids].mean()) if ids else 0)
        references.append(dict(name=name,peak=peak))
    return dict(version=VERSION,graphId=graph.get('modelId',graph['source']),parameters=p,baseline=references[0]['peak'],reference=max(r['peak'] for r in references),references=references)
