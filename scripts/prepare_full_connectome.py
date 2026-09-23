"""Build full, fixed-wiring FlyWire assets. No neuron or connection sampling.

R1-6 columns are inferred from recorded contacts onto annotated L1/L2/L3.
The winning column and fraction of anchor synapses are retained for audit.
"""
import hashlib
import json
import re
from pathlib import Path
import numpy as np
import pandas as pd
from prepare_real_connectome import SOURCES, EXPECTED_SHA256
from attach_visual_columns import SHA256 as COLUMN_SHA, URL as COLUMN_URL

ROOT = Path(__file__).resolve().parents[1]

def main():
    raw = ROOT / 'data/raw'
    sources = []
    for name, expected in {**EXPECTED_SHA256, 'column_assignment.csv.gz': COLUMN_SHA}.items():
        file = raw / name
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if digest != expected:
            raise ValueError(f'Checksum mismatch: {name}')
        sources.append(dict(file=name, sha256=digest, url=SOURCES.get(name, COLUMN_URL)))
    ann = pd.read_csv(raw/'flywire_annotations_783.tsv', sep='\t', dtype=str).fillna('').drop_duplicates('root_id').sort_values('root_id').reset_index(drop=True)
    columns = pd.read_csv(raw/'column_assignment.csv.gz', dtype={'root_id': str})
    columns = columns.merge(ann[['root_id','cell_type','side']], on='root_id')
    columns = columns[(columns.type == columns.cell_type) & (columns.hemisphere == columns.side)]
    by_id = columns.set_index('root_id')
    edges = pd.read_parquet(raw/'Connectivity_783.parquet', columns=['Presynaptic_ID','Postsynaptic_ID','Connectivity'])
    ids = pd.Index(ann.root_id.astype('int64'))
    pre = ids.get_indexer(edges.Presynaptic_ID)
    post = ids.get_indexer(edges.Postsynaptic_ID)
    valid = (pre >= 0) & (post >= 0) & (edges.Connectivity.to_numpy() > 0)
    excluded = int((~valid).sum())
    edges = edges.loc[valid]
    pre, post = pre[valid], post[valid]
    counts = edges.Connectivity.to_numpy(dtype=np.float32)
    # Infer R1-6 receptive-field column from ALL source contacts, not a display crop.
    receptors = set(ann.loc[ann.cell_type == 'R1-6', 'root_id'].astype('int64'))
    anchors = columns[columns.type.isin(['L1','L2','L3'])].copy()
    anchors['Postsynaptic_ID'] = anchors.root_id.astype('int64')
    contacts = edges[edges.Presynaptic_ID.isin(receptors)].merge(anchors[['Postsynaptic_ID','hemisphere','column_id','x','y','p','q']], on='Postsynaptic_ID')
    grouped = contacts.groupby(['Presynaptic_ID','hemisphere','column_id','x','y','p','q'], as_index=False).Connectivity.sum()
    totals = grouped.groupby('Presynaptic_ID').Connectivity.sum()
    best = grouped.sort_values(['Connectivity','column_id'], ascending=[False,True], kind='stable').drop_duplicates('Presynaptic_ID')
    inferred = {str(int(r.Presynaptic_ID)): r for r in best.itertuples()}
    types = sorted(set(ann.cell_type)); regions = sorted(set(ann.super_class))
    type_index = {t:i for i,t in enumerate(types)}; region_index = {r:i for i,r in enumerate(regions)}
    nodes = []; mapping = []; mapped = 0; dopamine = 0
    for a in ann.itertuples():
        nt = a.known_nt or a.top_nt
        tokens = {v.strip().lower() for v in re.split('[;,]', nt)}
        sign = -1 if tokens & {'histamine','gaba','glutamate'} else 1 if tokens & {'acetylcholine','ach'} else 0
        da = int(bool(tokens & {'dopamine','da'})); dopamine += da
        u = v = -1.; confidence = 0.; method = 'unmapped'
        row = by_id.loc[a.root_id] if a.root_id in by_id.index else inferred.get(a.root_id)
        if row is not None and row.hemisphere == a.side:
            horizontal = (float(row.x)+9)/17
            u = .5+.5*horizontal if row.hemisphere == 'right' else .5-.5*horizontal
            v = (30-float(row.y))/59
            method = 'published' if a.root_id in by_id.index else 'L1/L2/L3 contacts'
            confidence = 1. if method == 'published' else float(row.Connectivity/totals[int(a.root_id)])
        photo = a.cell_type in ('R1-6','R7','R8')
        if photo:
            mapped += u >= 0
            mapping.append(dict(neuron_id=a.root_id, cell_type=a.cell_type, method=method, confidence=confidence, u=u, v=v))
        # Full IDs stay strings; never round 64-bit FlyWire IDs through JS numbers.
        nodes.append([a.root_id,type_index[a.cell_type],region_index[a.super_class],sign,u,v,da])
    order = np.argsort(pre, kind='stable')
    offsets = np.zeros(len(ann)+1, dtype='<u4')
    offsets[1:] = np.cumsum(np.bincount(pre, minlength=len(ann)), dtype=np.uint32)
    assets = {
        'offsets.bin': offsets.tobytes(),
        'posts.bin': post[order].astype('<u4').tobytes(),
        'counts.bin': counts[order].astype('<f4').tobytes(),
        'neurons.json': json.dumps(dict(types=types,regions=regions,nodes=nodes), separators=(',',':')).encode(),
        'photoreceptor-mapping.json': json.dumps(mapping,separators=(',',':')).encode(),
    }
    hashes = {name:hashlib.sha256(data).hexdigest() for name,data in assets.items()}
    model_id = hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()
    output = ROOT/'public/models'/model_id
    output.mkdir(parents=True,exist_ok=True)
    for name,data in assets.items():
        (output/name).write_bytes(data)
    manifest = dict(version='full-flywire-v1',modelId=model_id,baseUrl=f'/models/{model_id}',neurons=len(ann),connections=len(counts),connectionsAtFive=int((counts>=5).sum()),photoreceptors=len(mapping),mappedPhotoreceptors=int(mapped),dopamineNeurons=dopamine,files={name:dict(sha256=hashes[name],bytes=len(data)) for name,data in assets.items()},sources=sources,excludedEdges=excluded,
        selection='All annotated neurons and all positive-count source connections with both endpoints annotated; no visual crop, depth pruning or weight learning.',
        mapping='Published R7/R8 columns; R1-6 winning synapse-weighted L1/L2/L3 column. Flat split-field projection, not measured visual angles. Unmapped receptors receive zero image drive.',
        physiology='LIF approximation including graded visual neurons; histamine/GABA/glutamate inhibitory, acetylcholine excitatory; monoamines/unknown no fast current. RGB luminance only, no UV reconstruction.')
    (ROOT/'data/processed/full-model.json').write_text(json.dumps(manifest,indent=2))
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps({k:manifest[k] for k in ['modelId','neurons','connections','photoreceptors','mappedPhotoreceptors','dopamineNeurons','excludedEdges']}),flush=True)

if __name__ == '__main__':
    main()
