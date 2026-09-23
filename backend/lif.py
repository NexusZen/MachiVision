"""Fixed-synapse LIF model; parameters from the pinned Shiu model.py.

The early-vision encoder and video projection are engineering assumptions.
No plasticity, reward, habituation memory, or trainable weights are present.
"""
import numpy as np
from scipy.sparse import csr_matrix

VERSION = 'fixed-synapse-lif-v4-light'
DT = .0002

def stable_hash(text):
    h=2166136261
    for char in text:
        h=((h^ord(char))*16777619)&0xffffffff
    return h or 1

def is_driven_input(n):
    return n['depth']==0 or bool(n.get('visual_column')) and n.get('cell_type') in ('Mi1','Tm1')


def sensory_drive(n,f):
    typ=n.get('cell_type') or ''
    left=n['hemisphere'].lower()=='left'
    if typ=='LC4' or n.get('input_feature')=='looming':return float(np.clip(f['looming'],0,1))
    if typ in ('Mi1','Tm1'):
        c=n.get('visual_column')
        if not c:return 0.
        r=f.get('retina')
        if not r:return float(np.clip(f.get('luminance_on' if typ=='Mi1' else 'luminance_off',0),0,1))
        w,h=r['width'],r['height'];x=int(np.clip(np.floor(c['u']*(w-1)+.5),0,w-1));y=int(np.clip(np.floor(c['v']*(h-1)+.5),0,h-1))
        return r.get('lightOn' if typ=='Mi1' else 'lightOff',[0]*(w*h))[y*w+x]
    if typ in ['T4a','T4b','T4c','T4d','T5a','T5b','T5c','T5d']:
        sub=typ[-1]
        if f.get('retina') is not None:
            c=n.get('visual_column')
            if not c:return 0.
            r=f['retina'];w,h=r['width'],r['height']
            x=int(np.clip(np.floor(c['u']*(w-1)+.5),0,w-1));y=int(np.clip(np.floor(c['v']*(h-1)+.5),0,h-1))
            d=(1 if left else 0) if sub=='a' else (0 if left else 1) if sub=='b' else 2 if sub=='c' else 3
            return r['on' if typ.startswith('T4') else 'off'][d][y*w+x]
        direction=(-f['motion_x'] if left else f['motion_x']) if sub=='a' else (f['motion_x'] if left else -f['motion_x']) if sub=='b' else -f['motion_y'] if sub=='c' else f['motion_y']
        return float(np.clip(direction,0,1))*f['contrast']
    return float(np.clip(f['contrast']*.12+f['motion_magnitude']*.45+f['looming']*.45+f['temporal_change']*.3,0,1))

class Simulator:
    def __init__(self,graph,membraneMs=20,synapseMv=.275,input_gain=1,threshold=5,hops=6):
        if not all(np.isfinite(v) for v in [membraneMs,synapseMv,input_gain,threshold,hops]) or membraneMs<=5 or min(synapseMv,input_gain,threshold)<0 or hops<1:
            raise ValueError('Invalid LIF simulation parameters')
        self.graph=graph;self.nodes=graph['neurons'];self.membraneMs=membraneMs;self.input_gain=input_gain
        self.n=len(self.nodes);self.index={n['neuron_id']:i for i,n in enumerate(self.nodes)}
        self.depth=np.array([n['depth'] for n in self.nodes]);self.enabled=self.depth<hops;self.driven=np.array([is_driven_input(n) for n in self.nodes]);self.inputs=np.flatnonzero(self.driven)
        rows=[];cols=[];weights=[]
        for e in graph['connections']:
            if e['synapse_count']<threshold:continue
            pre=self.index[e['pre_neuron']];post=self.index[e['post_neuron']]
            rows.append(post);cols.append(pre);weights.append(e['synapse_count']*self.nodes[pre].get('fast_sign',1 if graph['synthetic'] else 0)*synapseMv)
        self.matrix=csr_matrix((weights,(rows,cols)),shape=(self.n,self.n))
        self.v=np.full(self.n,-52.);self.g=np.zeros(self.n);self.rfc=np.zeros(self.n,dtype=int)
        self.rng=np.array([stable_hash(n['neuron_id']) for n in self.nodes],dtype=np.uint32)
        self.pending=np.zeros((10,self.n));self.tick=0;self.remainder=0.;self.a=np.zeros(self.n)


    def step(self,f,dt=.05):
        if not np.isfinite(dt) or not 0<=dt<=1:raise ValueError('Sample duration must be between 0 and 1 second')
        prob=np.array([1-np.exp(-150*self.input_gain*sensory_drive(self.nodes[i],f)*DT) for i in self.inputs])
        m=np.exp(-DT/(self.membraneMs/1000));s=np.exp(-DT/.005);coupling=.005/(self.membraneMs/1000-.005)*(m-s)
        counts=np.zeros(self.n,dtype=int);depolarization=np.zeros(self.n);events=[];steps=0;self.remainder+=dt
        while self.remainder+1e-12>=DT:
            self.g+=self.matrix@self.pending[self.tick%10];self.pending[self.tick%10].fill(0)
            x=self.rng[self.inputs].copy();x^=x<<np.uint32(13);x^=x>>np.uint32(17);x^=x<<np.uint32(5);self.rng[self.inputs]=x
            self.v[self.inputs[x.astype(float)/4294967296<prob]]+=68.75
            enabled=self.enabled&(self.tick>=self.rfc)
            self.v[enabled]=-52+(self.v[enabled]+52)*m+self.g[enabled]*coupling;self.g[enabled]*=s
            self.v[~self.enabled]=-52;self.g[~self.enabled]=0
            depolarization[enabled]+=np.maximum(0,np.minimum(-45,self.v[enabled])+52)
            fired=np.flatnonzero(enabled&(self.v>-45))
            counts[fired]+=1;events.extend([[int(i),(self.tick+1)*DT] for i in fired])
            self.v[fired]=-52;self.g[fired]=0;self.rfc[fired]=self.tick+np.where(self.driven[fired],1,11)
            self.pending[(self.tick+9)%10,fired]=1
            self.tick+=1;steps+=1;self.remainder=max(0,self.remainder-DT)
        seconds=steps*DT;rate=counts/seconds if seconds else np.zeros(self.n);self.a=np.minimum(1,rate/150)
        mean=lambda values:float(np.mean(values)) if len(values) else 0.
        groups=[n['brain_region'] if self.graph['synthetic'] else n.get('super_class') or 'Unavailable' for n in self.nodes]
        regions={group:mean(self.a[np.array([g==group for g in groups])]) for group in set(groups)}
        downstream=[i for i,n in enumerate(self.nodes) if (n['depth']==4 if self.graph['synthetic'] else n.get('super_class') in ('descending','motor'))]
        components=dict(visual=mean(self.a[self.inputs]),motion=f['motion_magnitude'],contrast=f['contrast'],network=mean(self.a>.2),downstream=mean(self.a[downstream]),looming=f['looming'],temporal_change=f['temporal_change'])
        return dict(depolarizationMv=(depolarization/steps if steps else depolarization).tolist(),features=f,activation=self.a.tolist(),voltageMv=self.v.tolist(),spikeCounts=counts.tolist(),rateHz=rate.tolist(),spikeEvents=events,windowSeconds=seconds,simulationTimeSeconds=self.tick*DT,
            score=100*float(np.count_nonzero(counts))/max(1,self.n),components=components,regions=regions,active=int((counts>0).sum()),trigger='Object expansion' if f['looming']>.3 else 'Visual input')

class Retina:
    def __init__(self):self.receptor=None;self.delayed_on=None;self.delayed_off=None
    def frame(self,frame,dt=.05):
        # OpenCV BGR frame; exact area bins matching the browser's RGB luminance.
        h,w=frame.shape[:2];rw,rh=36,30
        gray=(.114*frame[:,:,0]+.587*frame[:,:,1]+.299*frame[:,:,2])/255
        yy,xx=np.indices((h,w));indices=(yy*rh//h)*rw+xx*rw//w
        counts=np.bincount(indices.ravel(),minlength=rw*rh)
        light=(np.bincount(indices.ravel(),weights=gray.ravel(),minlength=rw*rh)/np.maximum(1,counts)).reshape(rh,rw)
        first=self.receptor is None
        if first:self.receptor=light.copy()
        r=np.exp(-dt/.01);slow=np.exp(-dt/.03);before=self.receptor.copy();self.receptor=r*self.receptor+(1-r)*light
        delta=self.receptor-before;light_on=np.zeros_like(delta) if first else np.clip(delta,0,1);light_off=np.zeros_like(delta) if first else np.clip(-delta,0,1)
        sums=np.zeros((rh,rw));numbers=np.zeros((rh,rw))
        for dy in [-1,0,1]:
            for dx in [-1,0,1]:
                sy=slice(max(0,-dy),min(rh,rh-dy));sx=slice(max(0,-dx),min(rw,rw-dx))
                ty=slice(max(0,dy),min(rh,rh+dy));tx=slice(max(0,dx),min(rw,rw+dx))
                sums[ty,tx]+=self.receptor[sy,sx];numbers[ty,tx]+=1
        center=sums/numbers;contrast=(self.receptor-center)/(center+.05);on=np.clip(contrast,0,1);off=np.clip(-contrast,0,1)
        if first:self.delayed_on=on.copy();self.delayed_off=off.copy()
        def motion(now,delay):
            result=np.zeros((4,rh,rw))
            if not first:
                for d,(dx,dy) in enumerate([(-1,0),(1,0),(0,1),(0,-1)]):
                    for y in range(rh):
                        for x in range(rw):
                            xx,yy=x+dx,y+dy
                            if 0<=xx<rw and 0<=yy<rh and xx//18==x//18:result[d,y,x]=np.clip(4*(delay[yy,xx]*now[y,x]-delay[y,x]*now[yy,xx]),0,1)
            delay[:]=slow*delay+(1-slow)*now
            return result.reshape(4,-1).tolist()
        return dict(width=rw,height=rh,on=motion(on,self.delayed_on),off=motion(off,self.delayed_off),lightOn=light_on.ravel().tolist(),lightOff=light_off.ravel().tolist())
