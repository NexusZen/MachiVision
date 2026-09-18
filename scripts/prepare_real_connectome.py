"""Build a reproducible visual subset from original-author FlyWire v783 data."""
import hashlib,json,urllib.request,re
from pathlib import Path
import numpy as np
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]
CONNECTIVITY_REV='91bdd1e7dcf193f3e7ca5a8933497fcef63b7960'
ANNOTATION_REV='8587524c1748ce5ef2080822a2fc890fc03bf597'
SOURCES={
 'Connectivity_783.parquet':f'https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/{CONNECTIVITY_REV}/Connectivity_783.parquet',
 'flywire_annotations_783.tsv':f'https://raw.githubusercontent.com/flyconnectome/flywire_annotations/{ANNOTATION_REV}/supplemental_files/Supplemental_file1_neuron_annotations.tsv',
}
EXPECTED_SHA256={
 'Connectivity_783.parquet':'efeb23fb99098e9c390f6869969b2a121a2ee92c833cfc45ecb2c1d8e1af0347',
 'flywire_annotations_783.tsv':'9a4f8b2f843196074431ebd7cd883536afa1be86c8a4ce90970441e8be81d1be',
}

def main():
    raw=ROOT/'data/raw';raw.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for name,url in SOURCES.items():
        file=raw/name
        if not file.exists():
            print('Downloading',name,flush=True)
            with urllib.request.urlopen(url,timeout=180) as response,file.open('wb') as target:
                while block:=response.read(1024*1024):target.write(block)
        digest=hashlib.sha256(file.read_bytes()).hexdigest()
        if digest!=EXPECTED_SHA256[name]:raise ValueError(f'Checksum mismatch for {name}; refusing to import a changed or incomplete source file')
        manifest.append(dict(file=name,url=url,sha256=digest,bytes=file.stat().st_size))
    ann=pd.read_csv(raw/'flywire_annotations_783.tsv',sep='\t',dtype=str).fillna('')
    ann=ann.drop_duplicates('root_id').set_index('root_id',drop=False)
    edges=pd.read_parquet(raw/'Connectivity_783.parquet',columns=['Presynaptic_ID','Postsynaptic_ID','Connectivity'])
    total_edges=len(edges)
    edges=edges[edges.Connectivity>=5]
    valid=set(ann.index.astype('int64'))
    available=set(edges.Presynaptic_ID)|set(edges.Postsynaptic_ID)
    seeds=[]
    for typ in ['T4a','T4b','T4c','T4d','T5a','T5b','T5c','T5d','LC4']:
        for side in ['left','right']:
            group=ann[(ann.cell_type==typ)&(ann.side==side)]
            ids=sorted(int(s) for s in group.root_id if int(s) in available)
            # Systematically sample across root IDs; this is not a retinotopic sample.
            if ids:seeds.extend(ids[i] for i in np.linspace(0,len(ids)-1,min(64,len(ids)),dtype=int))
    totals=edges.groupby('Postsynaptic_ID').Connectivity.sum()
    effective_nt=ann.known_nt.where(ann.known_nt!='',ann.top_nt)
    dopamine={int(i) for i,nt in effective_nt.items() if any(t.strip().lower() in ('dopamine','da') for t in re.split('[;,]',nt)) and int(i) in available}
    direct=edges[edges.Postsynaptic_ID.isin(dopamine)]
    partners=set(int(i) for i in direct.Presynaptic_ID if int(i) in valid)
    # Find shortest source-verified visual paths; prefer the strongest product
    # of normalized edge weights when multiple shortest paths exist.
    distance={s:0 for s in seeds};strength={s:1. for s in seeds};parent={};frontier=set(seeds)
    for hop in range(1,6):
        candidate=edges[edges.Presynaptic_ID.isin(frontier)&~edges.Postsynaptic_ID.isin(distance)&edges.Postsynaptic_ID.isin(valid)].copy()
        candidate['path_strength']=candidate.Connectivity/candidate.Postsynaptic_ID.map(totals)*candidate.Presynaptic_ID.map(strength)
        best=candidate.sort_values(['path_strength','Presynaptic_ID'],ascending=[False,True],kind='stable').drop_duplicates('Postsynaptic_ID')
        frontier=set()
        for e in best.itertuples():
            rid=int(e.Postsynaptic_ID);distance[rid]=hop;strength[rid]=float(e.path_strength);parent[rid]=int(e.Presynaptic_ID);frontier.add(rid)
    selected_ids=set(seeds)|dopamine|partners
    for target in list(selected_ids):
        while target in parent:
            target=parent[target];selected_ids.add(target)
    # Keep existing context neurons where practical, without pruning the target paths.
    for rid in sorted(distance,key=lambda i:(-strength[i],i)):
        if len(selected_ids)>=18000:break
        selected_ids.add(rid)
    if len(selected_ids)>30000:raise ValueError('Pathway subset exceeds the live browser budget; do not silently prune target inputs')
    depth={rid:distance.get(rid,99) for rid in sorted(selected_ids)}
    selected=edges[edges.Presynaptic_ID.isin(depth)&edges.Postsynaptic_ID.isin(depth)]
    selected=selected.groupby(['Presynaptic_ID','Postsynaptic_ID'],as_index=False).Connectivity.sum()
    # Normalize against ALL retained input synapses, including sources outside the subset.
    nodes=[];coords=[]
    for rid,d in depth.items():
        a=ann.loc[str(rid)]
        xyz=[float(a['pos_'+axis])*scale for axis,scale in zip('xyz',[4,4,40])]
        coords.append(xyz)
        nt=a.known_nt or a.top_nt or ''
        tokens={v.strip().lower() for v in re.split('[;,]',nt)}
        sign=-1 if tokens&{'gaba','glutamate'} else 1 if tokens&{'acetylcholine','ach'} else 0
        nodes.append(dict(neuron_id=str(rid),cell_type=a.cell_type or None,super_class=a.super_class or None,brain_region='Unavailable',neuropil=None,hemisphere=a.side.title() or 'Unavailable',neurotransmitter=nt or None,fast_sign=sign,receptor_effect=None,neurotransmitter_source='known_nt' if a.known_nt else 'predicted top_nt',depth=d,input_feature=('looming' if a.cell_type=='LC4' else 'motion') if d==0 else None,position=[],source_position_nm=xyz,geometry_source='Official neuron anchor coordinate, 4x4x40 nm voxels converted to nm; not a skeleton',annotation_source=f'flyconnectome/flywire_annotations@{ANNOTATION_REV}',skeleton_reference=None,morphology_reference=None))
    physical=np.array(coords);center=(physical.min(axis=0)+physical.max(axis=0))/2;scale=np.ptp(physical,axis=0).max()/7.5
    for n,pos in zip(nodes,(physical-center)/scale):n['position']=[float(pos[0]),float(-pos[1]),float(pos[2])]
    connections=[dict(pre_neuron=str(int(e.Presynaptic_ID)),post_neuron=str(int(e.Postsynaptic_ID)),synapse_count=int(e.Connectivity),normalized_weight=float(e.Connectivity/totals[e.Postsynaptic_ID]),neurotransmitter_sign_if_known=None) for e in selected.itertuples()]
    coverage=dict(dopamine_targets=len(dopamine),dopamine_reachable=sum(i in distance for i in dopamine),direct_partners=len(partners),target_incoming_edges=len(direct),retained_target_incoming_edges=int(selected.Postsynaptic_ID.isin(dopamine).sum()),max_visual_path_hops=5)
    graph=dict(source='FlyWire FAFB v783 · visual–dopamine pathways',synthetic=False,neurons=nodes,connections=connections,provenance=dict(files=manifest,connectivity_revision=CONNECTIVITY_REV,annotation_revision=ANNOTATION_REV,source_edges=total_edges,coverage=coverage,normalization='Incoming synapse sum in full thresholded source graph',selection='Up to 64 cells per T4/T5 subtype and LC4 per hemisphere; all dopamine targets and annotated direct inputs; strongest shortest visual paths within five hops; induced connections >=5 synapses',signaling='ACh +1, GABA/glutamate -1 fast-current approximation; monoamines/unknown 0; receptor-specific effects unavailable',mapping='Literature-supported population roles; scalar stimulus gains are model assumptions, no subtype retinotopy or biological calibration',geometry='Real anchor coordinates; straight graph edges, no neuron skeletons'))
    output=ROOT/'data/processed';output.mkdir(parents=True,exist_ok=True)
    (output/'visual_subgraph.json').write_text(json.dumps(graph,separators=(',',':')),encoding='utf-8')
    (output/'provenance.json').write_text(json.dumps(graph['provenance'],indent=2),encoding='utf-8')
    print(json.dumps(coverage),flush=True)
    print(json.dumps(dict(neurons=len(nodes),edges=len(connections),seed_count=len(seeds),groups=pd.Series([n['super_class'] for n in nodes]).value_counts().to_dict())))

if __name__=='__main__':main()
