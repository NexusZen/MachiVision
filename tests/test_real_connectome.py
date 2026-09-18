import json
from pathlib import Path
import numpy as np
import pytest
from backend.engine import RealConnectomeAdapter,Simulator,extract,trace_path

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def real_graph():return RealConnectomeAdapter(ROOT/'data/processed/visual_subgraph.json').load()

def test_real_subset_has_provenance_and_no_synthetic_identifiers(real_graph):
    g=real_graph
    assert g['synthetic'] is False
    assert 10000<=len(g['neurons'])<=20000 and len(g['connections'])>16913
    assert g['provenance']['source_edges']==15091983
    assert all(n['neuron_id'].isdigit() and len(n['neuron_id'])==18 for n in g['neurons'])
    assert all(n.get('source_position_nm') and len(n['position'])==3 for n in g['neurons'])
    assert all(n['cell_type'] in ['T4a','T4b','T4c','T4d','T5a','T5b','T5c','T5d','LC4'] for n in g['neurons'] if n['depth']==0)
    totals={}
    for e in g['connections']:
        assert e['synapse_count']>=5
        totals[e['post_neuron']]=totals.get(e['post_neuron'],0)+e['normalized_weight']
    assert all(total<=1+1e-9 for total in totals.values())

def test_looming_drives_only_annotated_looming_inputs(real_graph):
    f,_=extract(np.zeros((80,128,3),np.uint8),None,0)
    f['looming']=1
    result=Simulator(real_graph).step(f)
    for n,a in zip(real_graph['neurons'],result['activation']):
        if n['depth']==0:assert (a>0)==(n['cell_type']=='LC4')

def test_real_descending_path_exists_in_source_graph(real_graph):
    target=next(n['neuron_id'] for n in real_graph['neurons'] if n['super_class']=='descending')
    path=trace_path(real_graph,target)
    edges={(e['pre_neuron'],e['post_neuron']) for e in real_graph['connections']}
    assert len(path)>1
    assert all((a,b) in edges for a,b in zip(path,path[1:]))

def test_overall_score_includes_all_configured_components(real_graph):
    sim=Simulator(real_graph)
    f,_=extract(np.zeros((80,128,3),np.uint8),None,0)
    f.update(motion_magnitude=.8,contrast=.7,looming=.3,temporal_change=.2)
    state=sim.step(f)
    assert state['score']==pytest.approx(100*sum(sim.weights[k]*v for k,v in state['components'].items()))
    assert sum(sim.weights.values())==pytest.approx(1)


def test_dopamine_report_records_peak_and_excludes_negative_annotations():
    from backend.engine import report
    graph={'source':'test','synthetic':False,'neurons':[{'neurotransmitter':'dopamine'},{'neurotransmitter':'dopamine-negative'},{'neurotransmitter':'acetylcholine; dopamine'}],'connections':[]}
    frames=[{'activation':a,'score':0,'features':{'timestamp':i},'trigger':'test'} for i,a in enumerate([[.2,1,.4],[.8,0,.6],[0,1,0]])]
    result=report(frames,graph,{})
    assert result['dopamine_neuron_count']==2
    assert result['dopamine_high']==pytest.approx(70)
    assert result['dopamine_peak_timestamp']==1
    assert frames[-1]['dopamine']==0

def test_all_source_inputs_to_dopamine_targets_are_retained(real_graph):
    import pandas as pd
    import re
    targets={int(n['neuron_id']) for n in real_graph['neurons'] if any(t.strip().lower() in ('da','dopamine') for t in re.split('[;,]',n.get('neurotransmitter') or ''))}
    source=pd.read_parquet(ROOT/'data/raw/Connectivity_783.parquet',columns=['Presynaptic_ID','Postsynaptic_ID','Connectivity'])
    source=source[(source.Connectivity>=5)&source.Postsynaptic_ID.isin(targets)]
    expected={(int(e.Presynaptic_ID),int(e.Postsynaptic_ID)):int(e.Connectivity) for e in source.itertuples()}
    actual={(int(e['pre_neuron']),int(e['post_neuron'])):e['synapse_count'] for e in real_graph['connections'] if int(e['post_neuron']) in targets}
    assert actual==expected
    assert real_graph['provenance']['coverage']['dopamine_targets']==len(targets)

def test_backend_matches_saved_browser_reference_calibration(real_graph):
    from backend.response_calibration import calibration_for,response_index
    saved=real_graph['responseCalibration']
    # Remove the cache to exercise the independent backend implementation.
    recalculated=calibration_for({k:v for k,v in real_graph.items() if k!='responseCalibration'},{})
    assert recalculated['reference']==pytest.approx(saved['reference'],rel=1e-5)
    assert response_index(0,recalculated)==0
    assert response_index(recalculated['reference'],recalculated)==100
    for a,b in zip(saved['references'],recalculated['references']):
        assert a['name']==b['name']
        assert a['peak']==pytest.approx(b['peak'],rel=1e-5,abs=1e-10)
