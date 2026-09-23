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


def test_spikes_units_delay_and_fixed_weights():
    g=DemoConnectomeAdapter().load()
    g['neurons']=g['neurons'][:2]
    for i,n in enumerate(g['neurons']):n.update(depth=i,fast_sign=1)
    g['connections']=[dict(pre_neuron=g['neurons'][0]['neuron_id'],post_neuron=g['neurons'][1]['neuron_id'],synapse_count=1000,normalized_weight=.00001)]
    from backend.response_calibration import reference_features
    import copy
    original=copy.deepcopy(g)
    f=reference_features('Combined visual drive',20)
    sim=Simulator(g);first=None
    for t in range(500):
        s=sim.step(f,.0002)
        if first is None and s['spikeCounts'][0]:first=t
        if first is not None and t<first+9:assert s['voltageMv'][1]==-52
    assert first is not None
    whole=Simulator(g).step(f,.1)
    assert whole['spikeCounts'][1]>0
    assert whole['active']==sum(n>0 for n in whole['spikeCounts'])
    assert whole['rateHz']==[n/.1 for n in whole['spikeCounts']]
    assert g==original
    split=Simulator(g);events=[]
    for _ in range(20):events+=split.step(f,.005)['spikeEvents']
    assert events==whole['spikeEvents']
    np.testing.assert_allclose(split.v,whole['voltageMv'],atol=1e-12)
    g['neurons'][0]['fast_sign']=-1
    inhibited=Simulator(g).step(f,.1)
    assert inhibited['spikeCounts'][1]==0 and inhibited['voltageMv'][1]<-52
