"""Fixed-synapse spiking model with a reference-based dopamine response index."""
import json
import hashlib
from pathlib import Path
import cv2
import numpy as np
from scipy.sparse import csr_matrix

ROOT = Path(__file__).resolve().parents[1]
from backend.lif import Simulator, Retina, is_driven_input, VERSION as DYNAMICS_VERSION

class ConnectomeDataAdapter:
    def load(self):
        raise NotImplementedError

class DemoConnectomeAdapter(ConnectomeDataAdapter):
    def load(self):
        return json.loads((ROOT / 'data/demo/demo_connectome.json').read_text())

class RealConnectomeAdapter(ConnectomeDataAdapter):
    def __init__(self, path):
        self.path = Path(path)

    def load(self):
        graph = json.loads(self.path.read_text(encoding="utf-8"))
        if graph.get('synthetic') is not False or not graph.get('source'):
            raise ValueError('Real data must declare source provenance and synthetic=false')
        if not graph['neurons'] or len(graph['neurons']) > 20000:
            raise ValueError('Expected 1-20000 preprocessed neurons')
        return graph

def extract(frame, previous, timestamp):
    gray = cv2.cvtColor(cv2.resize(frame, (128, 80)), cv2.COLOR_BGR2GRAY)
    g = gray.astype(float) / 255
    prev = gray if previous is None else previous
    diff = np.abs(g - prev.astype(float) / 255)
    flow = cv2.calcOpticalFlowFarneback(prev, gray, None, .5, 3, 15, 3, 5, 1.2, 0)
    dx, dy = flow[..., 0], flow[..., 1]
    mag = np.sqrt(dx**2 + dy**2)
    y, x = np.mgrid[:80, :128]
    radial = (dx * (x - 64) + dy * (y - 40)) / (np.hypot(x - 64, y - 40) + 1)
    clip = lambda x: float(np.clip(x, 0, 1))
    f = dict(timestamp=float(timestamp), luminance=float(g.mean()), contrast=clip(g.std()*3),
             temporal_change=clip(diff.mean()*5), motion_x=float(dx.mean()/4), motion_y=float(dy.mean()/4),
             motion_magnitude=clip(mag.mean()/4), motion_direction=float(np.arctan2(dy.mean(), dx.mean())),
             expansion=clip(np.maximum(radial, 0).mean()/2), contraction=clip(np.maximum(-radial, 0).mean()/2),
             looming=clip(np.maximum(radial, 0).mean()/2), flicker=clip(abs(g.mean()-prev.mean()/255)*5),
             scene_change=clip(diff.mean()*2), left_field_activity=clip(diff[:,:64].mean()*5),
             right_field_activity=clip(diff[:,64:].mean()*5), edge_density=float((cv2.Canny(gray,60,120)>0).mean()),
             motion_coherence=float(np.hypot(dx.mean(),dy.mean())/(mag.mean()+1e-8)))
    spatial = []
    for cy in range(5):
        for cx in range(8):
            sl = np.s_[cy*16:(cy+1)*16,cx*16:(cx+1)*16]
            spatial.append(dict(contrast=clip(g[sl].std()*3), temporal_change=clip(diff[sl].mean()*5),
                                motion_magnitude=clip(mag[sl].mean()/4), looming=clip(np.maximum(radial[sl],0).mean()/2)))
    f['spatial'] = spatial
    return f, gray

def analyze_video(path, graph, parameters=None):
    cap = cv2.VideoCapture(str(path))
    try:
        fps, count = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not cap.isOpened() or fps <= 0 or count/fps > 120:
            raise ValueError('Video must decode and be at most 120 seconds')
        sim = Simulator(graph, **(parameters or {}))
        frames, previous = [], None
        retina = Retina()
        for t in np.arange(0,count/fps,.05):
            cap.set(cv2.CAP_PROP_POS_MSEC,float(t*1000))
            ok, frame = cap.read()
            if not ok: break
            f, previous = extract(frame,previous,t)
            f['retina'] = retina.frame(frame)
            state = sim.step(f)
            del f['retina']
            frames.append(state)
        if not frames: raise ValueError('No frames decoded')
        result=report(frames, graph, parameters or {})
        result['duration']=float(count/fps)
        return result
    finally:
        cap.release()

def report(frames, graph, parameters):
    import re
    dopamine_indices=[i for i,n in enumerate(graph['neurons']) if any(v.strip() in ('dopamine','da') for v in re.split('[;,]',(n.get('neurotransmitter') or '').lower()))]
    for f in frames:
        f['dopamineRateHz']=sum(f['rateHz'][i] for i in dopamine_indices)/len(dopamine_indices) if dopamine_indices else None
        f['dopamineRaw']=sum(f['depolarizationMv'][i] for i in dopamine_indices)/len(dopamine_indices) if dopamine_indices else None
        f.pop('dopamine',None)
    dopamine_peak=max(frames,key=lambda f:f['dopamineRaw'] if f['dopamineRaw'] is not None else -1)
    peak = max(frames,key=lambda f:f['score'])
    return dict(source=graph['source'],synthetic=graph['synthetic'],parameters=parameters,dynamics_version=DYNAMICS_VERSION,active_definition='at least one modeled spike per observation',raw_dopamine_unit='mV above rest',plasticity=False,frames=frames,peak=peak,dopamine_peak_depolarization_mv=dopamine_peak['dopamineRaw'],dopamine_peak_timestamp=dopamine_peak['features']['timestamp'],dopamine_neuron_count=len(dopamine_indices),
                average=float(np.mean([f['score'] for f in frames])),events=[dict(timestamp=f['features']['timestamp'],trigger=f['trigger'],score=f['score']) for i,f in enumerate(frames) if i%20==0 and f['score']>60],
                fingerprint=hashlib.sha256(json.dumps(dict(graph=graph,parameters=parameters,engine='opencv-farneback-'+DYNAMICS_VERSION,score_config=(ROOT/'config/flyscore.yaml').read_text()),sort_keys=True).encode()).hexdigest())

def trace_path(graph, target):
    from collections import deque
    inputs={n['neuron_id'] for n in graph['neurons'] if is_driven_input(n)}
    incoming={}
    for e in graph['connections']:incoming.setdefault(e['post_neuron'],[]).append(e['pre_neuron'])
    queue,seen=deque([[target]]),{target}
    while queue:
        path=queue.popleft()
        if path[0] in inputs: return path
        for pre in incoming.get(path[0],[]):
            if pre not in seen:
                seen.add(pre);queue.append([pre]+path)
    return []
