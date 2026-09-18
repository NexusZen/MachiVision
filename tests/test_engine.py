import numpy as np
import cv2
from backend.engine import DemoConnectomeAdapter,Simulator,extract,trace_path,report

def test_direction_and_looming():
    a=np.zeros((80,128,3),np.uint8);cv2.rectangle(a,(30,20),(60,60),(255,255,255),-1)
    b=np.zeros_like(a);cv2.rectangle(b,(34,20),(64,60),(255,255,255),-1)
    _,prev=extract(a,None,0);f,_=extract(b,prev,.05)
    assert f['motion_x']>0
    c=np.zeros_like(a);cv2.circle(c,(64,40),10,(255,255,255),-1)
    d=np.zeros_like(a);cv2.circle(d,(64,40),16,(255,255,255),-1)
    _,prev=extract(c,None,0);f,_=extract(d,prev,.05)
    assert f['looming']>0

def test_video_feature_to_graph_score():
    g=DemoConnectomeAdapter().load();sim=Simulator(g)
    black=np.zeros((80,128,3),np.uint8);white=np.full_like(black,255)
    f,prev=extract(black,None,0);zero=sim.step(f);assert zero['score']==0
    f,_=extract(white,prev,.05);first=sim.step(f);assert first['score']>0
    assert first['activation'][42]==0
    second=sim.step(f);assert second['activation'][42]>0
    assert len(trace_path(g,'demo-0-4-0'))==5
    r=report([zero,first,second],g,{})
    assert r['peak']['score']==max(first['score'],second['score'])

def test_decay_and_threshold():
    g=DemoConnectomeAdapter().load();sim=Simulator(g,threshold=100)
    sim.a[:]=.5
    f,_=extract(np.zeros((80,128,3),np.uint8),None,0)
    s=sim.step(f)
    assert abs(s['activation'][0]-.325)<1e-6
    assert abs(s['activation'][42]-.325)<1e-6

def test_recurrent_cycle_returns_to_silence():
    g=DemoConnectomeAdapter().load()
    g['neurons']=g['neurons'][:2]
    for n in g['neurons']: n['depth']=1
    g['connections']=[dict(pre_neuron=g['neurons'][i]['neuron_id'],post_neuron=g['neurons'][1-i]['neuron_id'],synapse_count=10,normalized_weight=1) for i in range(2)]
    sim=Simulator(g);sim.a[:]=1
    f,_=extract(np.zeros((80,128,3),np.uint8),None,0)
    for _ in range(100):sim.step(f)
    assert np.max(sim.a)<.00001
