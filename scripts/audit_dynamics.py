"""Reproducible synthetic feature probes, not biological validation."""
import json
import re
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.engine import Simulator

graph = json.loads(Path('data/processed/visual_subgraph.json').read_text())
ids = [i for i,n in enumerate(graph['neurons']) if any(s.strip().lower() in ('da','dopamine') for s in re.split('[;,]', n.get('neurotransmitter') or ''))]
zero = dict(timestamp=0,luminance=0,contrast=0,temporal_change=0,motion_x=0,motion_y=0,motion_magnitude=0,looming=0,flicker=0,left_field_activity=0,right_field_activity=0,scene_change=0,edge_density=0)
def snapshot(sim):
    return {'dopamine':round(float(sim.a[ids].mean()*100),3),'active':int((sim.a>.2).sum()),'saturated':int((sim.a>.999).sum()),'dopamine_saturated':int((sim.a[ids]>.999).sum())}

sim = Simulator(graph)
print('Corrected model probes below; original recurrence used only for the explicitly labeled spectral estimate and upper bound.')
# Perron estimate for the all-positive recurrent update operator.
v = np.ones(len(sim.a))
for _ in range(200):
    w = .65*v + .65*(sim.matrix@v)
    radius = np.linalg.norm(w) / np.linalg.norm(v)
    v = w / np.linalg.norm(w)
print('neurons',len(sim.a),'dopamine neurons',len(ids),'estimated original update spectral radius',radius)
print('incoming retained weight quantiles',np.quantile(np.asarray(sim.matrix.sum(axis=1)).ravel(),[0,.25,.5,.75,1]))
for magnitude in [.1,.5,1]:
    sim = Simulator(graph)
    f = {**zero,**{k:magnitude for k in ['contrast','temporal_change','motion_magnitude','looming','left_field_activity','right_field_activity']}}
    for step in range(600):
        sim.step(f)
        if step in [0,19,99,239,599]:print('drive',magnitude,'seconds',(step+1)/20,snapshot(sim))
    for step in range(400):
        sim.step(zero)
        if step in [19,99,399]:print('silence after',magnitude,'seconds',(step+1)/20,snapshot(sim))
# Clamp visual inputs at 1: upper reachable count under original recurrence.
sim=Simulator(graph)
for _ in range(1000):
    sim.a=np.clip(.65*sim.a+.65*(sim.matrix@sim.a),0,1)
    sim.a[sim.depth==0]=1
print('forced visual input upper bound',snapshot(sim))
