"""Stable signed rate model with a reference-based dopamine response index."""
import json
import hashlib
from pathlib import Path
import cv2
import numpy as np
from scipy.sparse import csr_matrix

ROOT = Path(__file__).resolve().parents[1]

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
    return f, gray

class Simulator:
    def __init__(self, graph, decay=.65, gain=.65, input_gain=1., threshold=5, hops=6):
        if not all(np.isfinite(v) for v in [decay,gain,input_gain,threshold,hops]) or not 0 <= decay < 1 or not 0 <= gain < 1 or not 1 <= hops <= 6 or not 0<=input_gain<=2 or not 0<=threshold<=100:
            raise ValueError('Invalid simulation parameters')
        self.graph, self.decay, self.gain, self.input_gain, self.hops = graph, decay, gain, input_gain, hops
        self.nodes = graph['neurons']
        self.index = {n['neuron_id']: i for i,n in enumerate(self.nodes)}
        row, col, weights = [], [], []
        for e in graph['connections']:
            if e['synapse_count'] >= threshold:
                row.append(self.index[e['post_neuron']]); col.append(self.index[e['pre_neuron']]); weights.append(e['normalized_weight']*self.nodes[self.index[e['pre_neuron']]].get('fast_sign',1))
        self.matrix = csr_matrix((weights,(row,col)),shape=(len(self.nodes),len(self.nodes)))
        self.a = np.zeros(len(self.nodes))
        self.depth = np.array([n['depth'] for n in self.nodes])
        self.left = np.array([n['hemisphere']=='Left' for n in self.nodes])
        self.looming = np.array([n.get('input_feature')=='looming' for n in self.nodes])
        self.motion = np.array([n.get('input_feature')=='motion' for n in self.nodes])
        self.downstream = self.depth==4 if graph['synthetic'] else np.array([n.get('super_class') in ('descending','motor') for n in self.nodes])
        group=lambda n:n['brain_region'] if graph['synthetic'] else n.get('super_class','Unavailable')
        self.region_masks={r:np.array([group(n)==r for n in self.nodes]) for r in {group(n) for n in self.nodes}}
        import yaml
        self.weights = yaml.safe_load((ROOT/'config/flyscore.yaml').read_text())['weights']

    def step(self, f):
        generic = f['contrast']*.12 + f['motion_magnitude']*.45 + f['looming']*.45 + f['temporal_change']*.3
        drive = np.where(self.looming,f['looming']*.8+f['temporal_change']*.1,np.where(self.motion,f['motion_magnitude']*.65+f['contrast']*.1+f['temporal_change']*.25,generic))
        fields = np.where(self.left,f['left_field_activity'],f['right_field_activity'])
        self.a = np.clip(self.decay*self.a + (1-self.decay)*self.gain*(self.matrix@self.a) + (self.depth==0)*self.input_gain*drive*(.7+.3*fields),0,1)
        self.a[self.depth >= self.hops] = 0
        mean = lambda a: float(np.mean(a)) if len(a) else 0.
        downstream=self.downstream
        components = dict(visual=mean(self.a[self.depth==0]), motion=f['motion_magnitude'], contrast=f['contrast'], network=mean(self.a>.2),
                          downstream=mean(self.a[downstream]), looming=f['looming'], novelty=f['temporal_change'])
        score = 100*sum(self.weights[k]*v for k,v in components.items())
        regions = {r:mean(self.a[mask]) for r,mask in self.region_masks.items()}
        trigger = 'Object expansion' if f['looming']>.3 else ('Leftward motion' if f['motion_x']<0 else 'Rightward motion') if f['motion_magnitude']>.25 else 'Rapid luminance change' if f['flicker']>.2 else 'Contrast structure'
        return dict(features=f, activation=np.round(self.a,8).tolist(), score=score, components=components, regions=regions, active=int((self.a>.2).sum()), trigger=trigger)

def analyze_video(path, graph, parameters=None):
    cap = cv2.VideoCapture(str(path))
    try:
        fps, count = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not cap.isOpened() or fps <= 0 or count/fps > 120:
            raise ValueError('Video must decode and be at most 120 seconds')
        sim = Simulator(graph, **(parameters or {}))
        frames, previous = [], None
        for t in np.arange(0,count/fps,.05):
            cap.set(cv2.CAP_PROP_POS_MSEC,float(t*1000))
            ok, frame = cap.read()
            if not ok: break
            f, previous = extract(frame,previous,t)
            frames.append(sim.step(f))
        if not frames: raise ValueError('No frames decoded')
        result=report(frames, graph, parameters or {})
        result['duration']=float(count/fps)
        return result
    finally:
        cap.release()

def report(frames, graph, parameters):
    import re
    from backend.response_calibration import calibration_for, response_index
    calibration=calibration_for(graph,parameters) if graph.get('modelId') else None
    dopamine_indices=[i for i,n in enumerate(graph['neurons']) if any(v.strip() in ('dopamine','da') for v in re.split('[;,]',(n.get('neurotransmitter') or '').lower()))]
    for f in frames:
        f['dopamineRaw']=100*sum(f['activation'][i] for i in dopamine_indices)/len(dopamine_indices) if dopamine_indices else None
        f['dopamine']=response_index(f['dopamineRaw'],calibration) if calibration else f['dopamineRaw']
    dopamine_peak=max(frames,key=lambda f:f['dopamine'] if f['dopamine'] is not None else -1)
    peak = max(frames,key=lambda f:f['score'])
    return dict(source=graph['source'],synthetic=graph['synthetic'],parameters=parameters,calibration=calibration,frames=frames,peak=peak,dopamine_high=dopamine_peak['dopamine'],dopamine_peak_timestamp=dopamine_peak['features']['timestamp'],dopamine_neuron_count=len(dopamine_indices),
                average=float(np.mean([f['score'] for f in frames])),events=[dict(timestamp=f['features']['timestamp'],trigger=f['trigger'],score=f['score']) for i,f in enumerate(frames) if i%20==0 and f['score']>60],
                fingerprint=hashlib.sha256(json.dumps(dict(graph=graph,parameters=parameters,engine='opencv-farneback-v4-signed-reference',score_config=(ROOT/'config/flyscore.yaml').read_text()),sort_keys=True).encode()).hexdigest())

def trace_path(graph, target):
    from collections import deque
    depths={n['neuron_id']:n['depth'] for n in graph['neurons']}
    queue,seen=deque([[target]]),{target}
    while queue:
        path=queue.popleft()
        if depths.get(path[0])==0: return path
        for e in graph['connections']:
            if e['post_neuron']==path[0] and e['pre_neuron'] not in seen:
                seen.add(e['pre_neuron']);queue.append([e['pre_neuron']]+path)
    return []
