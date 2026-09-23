# Real connectome provenance - 16 September 2026

## Loaded data

The default app now loads a real **FlyWire FAFB v783 visual subset: 18,940 neurons, 326,400 directed connections**, selected from 15,091,983 connections. No synthetic neuron IDs or generated connection strengths are included.

### Connectivity

Original research authors' repository: [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model), revision `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960`.

Downloaded `Connectivity_783.parquet` (100,804,642 bytes), SHA-256 `efeb23fb99098e9c390f6869969b2a121a2ee92c833cfc45ecb2c1d8e1af0347`.

Read `Presynaptic_ID`, `Postsynaptic_ID`, `Connectivity`; preserve IDs as decimal strings in JSON. The current fast-current signs are derived from official transmitter annotations: ACh +1, GABA/glutamate -1, and monoamine-only/unknown 0. These are model assumptions; receptor-specific effects remain unresolved.

### Annotations and coordinates

Official [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations), revision `8587524c1748ce5ef2080822a2fc890fc03bf597`.

Downloaded `supplemental_files/Supplemental_file1_neuron_annotations.tsv` as `flywire_annotations_783.tsv` (31,718,505 bytes), SHA-256 `9a4f8b2f843196074431ebd7cd883536afa1be86c8a4ce90970441e8be81d1be`.

Fields used: `root_id`, `cell_type`, `super_class`, `side`, `known_nt`, `top_nt`, `pos_x`, `pos_y`, `pos_z`. The official [column documentation](https://github.com/flyconnectome/flywire_annotations/blob/8587524c1748ce5ef2080822a2fc890fc03bf597/supplemental_files/README.md) defines anchor coordinates in 4 x 4 x 40 nm voxels. The importer converts to nm, centers and uniformly scales the point cloud, and flips display y. Original nm coordinates remain in every node. These are real anchor positions, not skeleton morphology. Missing neuropil annotations remain unavailable; the UI groups by annotated superclass instead of inventing regions.

## Reproducible extraction

`python scripts/prepare_real_connectome.py` samples up to 64 T4/T5 subtype and LC4 cells per hemisphere (1,128 seeds). It selects every positive dopamine/DA annotation including mixed labels, all their annotated direct presynaptic partners, and strongest shortest visual paths within five hops. All 24,972 source connections into those 1,535 targets above the five-synapse threshold are retained. The result has 18,940 neurons and 326,400 induced directed edges. See `data/processed/provenance.json` for coverage.

Weights divide edge synapse counts by the target's incoming synapse sum in the **full thresholded source graph**, so truncating the displayed subset does not inflate input weights. Every displayed edge and count is present in the source table. Bounds deliberately omit much of the full brain, including many inputs and recurrent partners.

`data/processed/provenance.json` records exact URLs, revisions, sizes, hashes and preprocessing choices. Raw files remain local and ignored by git; the small extracted graph is included for runnable checkout behavior.

## Input mapping: what is assumed

T4/T5 inputs now use published v783 column assignments, ON/OFF channels and subtype directions. The flat image projection and functional visual filters are assumptions. LC4 uses pooled expansion. See [the current methodology](METHODOLOGY.md) for provenance and model limits.

## Access notes and citations

The official [Zenodo connectivity archive](https://zenodo.org/records/10676866) was investigated, but its API timed out here. The [Codex download API](https://codex.flywire.ai/faq) requires an account token. The original authors' public repository provided a reproducible token-free v783 source. No login or scraping was used.

- Dorkenwald et al. (2024), [Neuronal wiring diagram of an adult brain](https://doi.org/10.1038/s41586-024-07558-y).
- Shiu et al. (2024), [A Drosophila computational brain model reveals sensorimotor processing](https://doi.org/10.1038/s41586-024-07763-9). The v783 data distributed in their repository are used; this app does not claim to reproduce their validated LIF model (whose paper used v630).
- Schlegel et al. (2024), [Whole-brain annotation and multi-connectome cell typing of Drosophila](https://doi.org/10.1038/s41586-024-07686-5).
- The pinned annotation repository includes later Matsliah/Berg annotation work; consult its README for associated citations and data-use terms. Source repository MIT software licensing does not replace source dataset terms.
