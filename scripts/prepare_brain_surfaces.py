"""Prepare public FAFB14.1 neuropil surfaces and spatial display associations.

Run after prepare_real_connectome.py. Requires numpy/scipy from the backend env.
The nearest-surface association is for visualization, not a neuropil annotation.
"""
import hashlib
import json
import struct
import zipfile
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / 'data/raw/neuropils-flywire.zip'
graph = json.loads((ROOT / 'data/processed/visual_subgraph.json').read_text())
physical = np.array([n['source_position_nm'] for n in graph['neurons']])
center = (physical.min(axis=0) + physical.max(axis=0)) / 2
scale = np.ptp(physical, axis=0).max() / 7.5
regions = []
samples = []
owners = []
with zipfile.ZipFile(archive) as z:
    for name in sorted(n for n in z.namelist() if n.endswith('.ply') and '/' not in n):
        data = z.read(name)
        offset = data.index(b'end_header\n') + len(b'end_header\n')
        header = data[:offset].decode()
        count = int(header.split('element vertex ')[1].split()[0])
        face_count = int(header.split('element face ')[1].split()[0])
        vertices = np.frombuffer(data, dtype='<f4', count=count * 3, offset=offset).reshape(-1, 3).copy()
        offset += count * 12
        faces = []
        for _ in range(face_count):
            size = struct.unpack_from('<i', data, offset)[0]
            offset += 4
            face = struct.unpack_from('<' + 'i' * size, data, offset)
            offset += size * 4
            for i in range(1, size - 1):
                faces.append([face[0], face[i], face[i + 1]])
        faces = np.array(faces)
        # A few gentle Laplacian passes soften tessellation without changing topology.
        edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
        edges = np.concatenate([edges, edges[:, ::-1]])
        degree = np.bincount(edges[:, 0], minlength=count).clip(1)
        for _ in range(3):
            summed = np.zeros_like(vertices)
            np.add.at(summed, edges[:, 0], vertices[edges[:, 1]])
            vertices = vertices * .7 + summed / degree[:, None] * .3
        samples.append(vertices)
        owners.extend([len(regions)] * count)
        display = (vertices - center) / scale * [1, -1, 1]
        # Y reflection changes winding.
        regions.append({'name': name[:-4], 'positions': display.round(5).flatten().tolist(),
                        'indices': faces[:, [0, 2, 1]].flatten().tolist(), 'neurons': []})

_, nearest = cKDTree(np.concatenate(samples)).query(physical)
for n, sample in zip(graph['neurons'], nearest):
    regions[owners[sample]]['neurons'].append(n['neuron_id'])
out = ROOT / 'public/brain'
out.mkdir(parents=True, exist_ok=True)
payload = {'source': 'JFRC2 neuropils transformed to FlyWire FAFB14.1 by fafbseg',
           'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'association': 'Nearest neuropil surface to neuron anchor; display approximation only',
           'regions': regions}
(out / 'neuropils.json').write_text(json.dumps(payload, separators=(',', ':')))
print(f"{len(regions)} regions, {sum(len(r['indices'])//3 for r in regions):,} triangles; "
      f"{(out / 'neuropils.json').stat().st_size:,} bytes")
