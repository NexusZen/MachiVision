"""Bounded BFS from explicitly selected, reviewed visual input IDs."""
import argparse,sqlite3,json,math
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('--database',default='data/processed/connectome.sqlite');p.add_argument('--input-ids',required=True,help='Text file, one verified input root ID per line');p.add_argument('--hops',type=int,default=4);p.add_argument('--min-synapses',type=int,default=5);p.add_argument('--limit',type=int,default=1500);p.add_argument('--output',default='data/processed/visual_subgraph.json');a=p.parse_args()
    if not 0<=a.hops<=4 or not 1<=a.limit<=5000: raise ValueError('hops 0–4; limit 1–5000')
    db=sqlite3.connect(a.database);db.row_factory=sqlite3.Row
    seeds=[s.strip() for s in Path(a.input_ids).read_text().splitlines() if s.strip()]
    if not seeds or len(seeds)>a.limit: raise ValueError('Invalid number of input IDs')
    for s in seeds:
        if not db.execute('SELECT id FROM neurons WHERE id=?',(s,)).fetchone(): raise ValueError(f'Input ID absent from annotations: {s}')
    depth={s:0 for s in seeds};frontier=seeds
    for hop in range(1,a.hops+1):
        following=[]
        for pre in frontier:
            for e in db.execute('SELECT post,SUM(synapses) n FROM edges JOIN neurons ON neurons.id=edges.post WHERE pre=? GROUP BY post HAVING n>=? ORDER BY n DESC,post',(pre,a.min_synapses)):
                if e['post'] not in depth and len(depth)<a.limit: depth[e['post']]=hop;following.append(e['post'])
        frontier=following
    nodes=[]
    source=db.execute('SELECT source FROM metadata').fetchone()[0]
    for i,(root,d) in enumerate(depth.items()):
        n=db.execute('SELECT * FROM neurons WHERE id=?',(root,)).fetchone();angle=i*2.399963
        nodes.append(dict(neuron_id=root,cell_type=n['cell_type'],super_class=n['super_class'],brain_region=n['region'],neuropil=None,hemisphere=n['hemisphere'],neurotransmitter=n['nt'],depth=d,position=[(d-2)*1.3,math.sin(angle)*1.8,math.cos(angle)],skeleton_reference=None,morphology_reference=None,annotation_source=source,geometry_source='Abstract graph layout; not anatomical coordinates'))
    edges=[];totals={}
    for pre in depth:
        for e in db.execute('SELECT post,SUM(synapses) n FROM edges WHERE pre=? GROUP BY post HAVING n>=?',(pre,a.min_synapses)):
            if e['post'] in depth:
                edges.append(dict(pre_neuron=pre,post_neuron=e['post'],synapse_count=e['n'],neurotransmitter_sign_if_known=None));totals[e['post']]=totals.get(e['post'],0)+e['n']
    for e in edges:e['normalized_weight']=e['synapse_count']/totals[e['post_neuron']]
    result=dict(source=source,synthetic=False,neurons=nodes,connections=edges,preprocessing=dict(hops=a.hops,threshold=a.min_synapses,limit=a.limit,input_ids=seeds,normalization='incoming synapse sum',mapping='User-reviewed visual input IDs; stimulus gains are unvalidated assumptions'))
    Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(result));print(len(nodes),'neurons,',len(edges),'edges')

if __name__=='__main__':main()
