# MachiVision — connectome lab

The browser now runs the full annotated FlyWire v783 brain: **139,248 neurons and 15,090,883 connections**, with fixed synapses and image input at mapped photoreceptors. There is no scrolling policy, learning, or plasticity.

The 3D view displays 18,940 sampled anchors. Network and circuit statistics come from the full simulation. Membrane depolarization (mV) and firing (Hz) remain separate; the activity score is the percentage of all simulated neurons that spike per observation window (0–100), without novelty weighting.

## Setup

Node.js 22 and Python with the dependencies in `backend/requirements.txt` are required.

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe scripts/prepare_real_connectome.py
.\.venv\Scripts\python.exe scripts/prepare_brain_surfaces.py
.\.venv\Scripts\python.exe scripts/attach_visual_columns.py
.\.venv\Scripts\python.exe scripts/prepare_full_connectome.py
npm run dev
```

The importer checks pinned source hashes, builds binary CSR assets in ignored `public/models/<hash>/`, and writes `data/processed/full-model.json`. Browser workers verify asset hashes before simulation. Missing assets cause an explicit error, never a silent fallback.

Open [the lab](http://127.0.0.1:3000). For production, stop the existing server before running `npm run build`, then `npm start`.

## Model and controls

- 8,653 of 11,118 photoreceptors have usable column mappings. R1–R6 use recorded L1/L2/L3 contacts; R7/R8 use published columns. Unmapped receptors receive no direct video drive.
- Linear RGB luminance drives a 10 ms receptor filter. There is no UV reconstruction or spectral subtype model.
- Early visual cells use a LIF approximation, including fixed 12 mV tonic lamina drive. This is not validated graded-potential physiology.
- T4/T5, Mi1/Tm1 and LC4 receive their activity from connectivity; motion and looming feature extractors no longer inject activity into them.
- All source connections are available. The default count threshold is 1, and no hop limit is applied.
- Controls: black image input, disconnected receptor outputs, seeded shuffled wiring and mirrored image. Black input can still produce tonic baseline activity.
- Preset computation streams observations and reuses loaded assets. Local video playback pauses between samples to wait for analysis. Full-brain computation can be slower than real time.
- The score chart stays fixed at 0–100 across experiments. Circuit tables and JSON exports include population sizes, spiking cells, rates and depolarization. Per-neuron arrays/raster events cover the display sample; aggregates cover all model neurons.

## Validation

```powershell
npm test
npx tsc --noEmit
npx tsx scripts/probe-full-model.ts
npm run build
```

Tests cover input mapping, signed propagation, ablation, immutable wiring, full-population aggregation and an optional analytical integrator against the default tick-by-tick equations. Source integrity and engineering tests do **not** establish agreement with biological response curves.

Read [full-model details](docs/FULL_MODEL.md) or the [in-app methodology](http://127.0.0.1:3000/methodology). Historical subset-engine tests and the optional Python/OpenCV batch API remain available for reference; that API is explicitly labelled as the older subset model and is not used by browser video playback.
