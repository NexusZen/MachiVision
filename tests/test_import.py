import json
import runpy
import sys
from pathlib import Path

def test_import_preserves_large_ids_and_actual_edges(tmp_path, monkeypatch):
    root=Path(__file__).resolve().parents[1]
    a,b='720575940600000001','720575940600000002'
    neurons=tmp_path/'neurons.csv';neurons.write_text(f'root_id,cell_type,side\n{a},,Left\n{b},,Right\n')
    edges=tmp_path/'edges.csv';edges.write_text(f'pre_root_id,post_root_id,syn_count,neuropil\n{a},{b},12,TEST\n')
    db=tmp_path/'source.sqlite'
    monkeypatch.setattr(sys,'argv',['preprocess','--neurons',str(neurons),'--connections',str(edges),'--output',str(db),'--source','TEST FIXTURE — NOT BIOLOGICAL DATA'])
    runpy.run_path(str(root/'scripts/preprocess_connectome.py'),run_name='__main__')
    ids=tmp_path/'ids.txt';ids.write_text(a)
    output=tmp_path/'graph.json'
    monkeypatch.setattr(sys,'argv',['subgraph','--database',str(db),'--input-ids',str(ids),'--output',str(output)])
    runpy.run_path(str(root/'scripts/build_visual_subgraph.py'),run_name='__main__')
    graph=json.loads(output.read_text())
    assert [n['neuron_id'] for n in graph['neurons']]==[a,b]
    assert graph['neurons'][1]['depth']==1
    assert graph['neurons'][1]['cell_type'] is None
    assert graph['connections'][0]['normalized_weight']==1
    assert graph['connections'][0]['synapse_count']==12
