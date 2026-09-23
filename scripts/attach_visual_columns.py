"""Attach version-matched published columns; never infer fields from soma positions."""
import hashlib
import json
from pathlib import Path
import urllib.request
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/column_assignment.csv.gz'
SHA256 = 'bdf4ce7f62cc63493d53eefad3816ff2dfd08b190e97b35a492e0e453df2f0f6'

def main():
    raw = ROOT / 'data/raw/column_assignment.csv.gz'
    if not raw.exists():
        with urllib.request.urlopen(URL, timeout=60) as response:
            raw.write_bytes(response.read())
    if hashlib.sha256(raw.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Column annotations changed; inspect and pin the new source before importing')
    rows = pd.read_csv(raw, dtype={'root_id':str}).set_index('root_id')
    path = ROOT / 'data/processed/visual_subgraph.json'
    graph = json.loads(path.read_text(encoding='utf-8'))
    mapped = 0
    for neuron in graph['neurons']:
        neuron.pop('visual_column', None)
        if neuron['neuron_id'] not in rows.index:
            continue
        row = rows.loc[neuron['neuron_id']]
        if row.hemisphere != neuron['hemisphere'].lower() or row['type'] != neuron['cell_type']:
            continue
        # Projection onto a flat video is an explicit approximation. Column p/q
        # is anatomical; these normalized screen coordinates are not visual angles.
        horizontal = (float(row.x)+9)/17
        neuron['visual_column'] = dict(p=int(row.p), q=int(row.q), column_id=int(row.column_id),
            u=.5+.5*horizontal if row.hemisphere=='right' else .5-.5*horizontal,
            v=(30-float(row.y))/59, source='FlyWire Codex FAFB v783 column_assignment')
        mapped += neuron['depth']==0
    graph['provenance']['visual_columns'] = dict(url=URL,sha256=SHA256,mapped_input_neurons=mapped,
        projection='Flat split-field projection of anatomical x/y; not calibrated visual angles',
        missing='Unmapped T4/T5 sensory drive disabled; LC4 uses pooled expansion encoder')
    graph.pop('responseCalibration',None)
    graph.pop('modelId',None)
    path.write_text(json.dumps(graph,separators=(',',':')),encoding='utf-8')
    print(f'Attached published columns to {mapped} sensory input neurons')

if __name__=='__main__':
    main()
