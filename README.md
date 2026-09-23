# MACHIVISION — Connectome Lab

<div align="center">

**Whole-Brain Drosophila Connectome Simulation & Visual Response Laboratory**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1-61dafb?logo=react)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.180-black?logo=three.js)](https://threejs.org/)
[![FlyWire](https://img.shields.io/badge/Connectome-FlyWire%20FAFB%20v783-orange)](https://flywire.ai/)
[![Tests](https://img.shields.io/badge/Tests-26%2F26%20Passing-brightgreen)](#validation)

</div>

---

## Overview

**MACHIVISION** is an interactive, browser-based computational neuroscience laboratory simulating visual stimulus propagation across the full adult *Drosophila melanogaster* connectome (**FlyWire FAFB v783**).

The simulation runs **139,248 neurons** and **15,090,883 synaptic connections** directly within client-side Web Workers using binary CSR (Compressed Sparse Row) graphs and leaky integrate-and-fire (LIF) dynamics, coupled with real-time 3D anatomical neuropil visualization and visual pathway inspection.

```
                           ┌──────────────────────────────┐
                           │      Video / Stimulus        │
                           └──────────────┬───────────────┘
                                          │ 128×80 @ 50ms frames
                                          ▼
                           ┌──────────────────────────────┐
                           │    Retinal Photoreceptors    │
                           │   8,653 mapped ommatidia     │
                           └──────────────┬───────────────┘
                                          │ Tonic drive & signed weights
                                          ▼
                           ┌──────────────────────────────┐
                           │   Full Connectome (FAFB)     │
                           │  139,248 simulated neurons   │
                           │   15M+ synaptic connections  │
                           └──────┬────────────────┬──────┘
                                  │                │
            ┌─────────────────────┴──────┐  ┌──────┴─────────────────────┐
            │   3D Neuropil Illumination │  │   Neural Activity Metrics  │
            │   18,940 sampled anchors   │  │   0–100 Activity Score     │
            │   Three.js anatomical mesh │  │   Dopamine mV & firing Hz  │
            └────────────────────────────┘  └────────────────────────────┘
```

---

## Key Features

- **Full-Brain Connectome Simulation**:
  - Simulates the complete annotated FlyWire v783 brain (139,248 neurons, 15M+ synapses) without artificial depth limits or hop truncations.
  - Client-side Web Worker architecture (`lib/live.worker.ts`, `lib/preset.worker.ts`) keeps the browser UI fluid and responsive at 60 FPS.

- **Zero-Stutter Video Preloading Pipeline**:
  - When custom videos (MP4, WebM, MOV) or built-in presets are selected, MACHIVISION isolates frame extraction in an offscreen pipeline.
  - Automatically simulates and caches all 50ms observation windows in advance, displaying an animated cinema screen buffering overlay (0% → 100%).
  - Once buffered, native video playback runs with zero pauses, instant timeline seeking, and $O(1)$ metric synchronization.

- **Interactive 3D Anatomical Neuropil View**:
  - Built with **Three.js** using verified FlyWire coordinate anchors and mesh surfaces.
  - Multi-angle perspectives: **Front**, **Side**, and **Dorsal**.
  - Dynamic neuropil illumination reflecting real-time population spike rates across Medulla, Lobula, Lobula Plate, and Central Brain.

- **Standardized Neural Activity Scoring (0–100)**:
  - Percentage of simulated neurons firing per 50ms observation window ($100 \times \text{spiking} / N_{\text{total}}$).
  - Fixed 0–100 scale across all stimuli for objective cross-experiment comparability.
  - Disentangled dopamine-cell membrane depolarization ($\Delta\text{mV}$) and firing rates ($\text{Hz}$).

- **FlyVision Visual Feature Extraction**:
  - Decomposes video stimuli into functional cues: coarse luminance, spatial contrast, optic flow motion magnitude, and looming/expansion.
  - Optional FlyVision toggle renders the contrast and temporal change cues as perceived by early insect visual filters.

- **Video Battle Mode**:
  - Compare two stimuli (Stimulus A vs. Stimulus B) against the exact same connectome parameters and control wiring to evaluate differential drive.

- **Pathway Inspector & Circuit Analysis**:
  - Select any neuron or neuropil region to inspect its firing frequency, membrane voltage, spike raster, and synaptic input chain back to photoreceptors.

- **Data Export**:
  - Comprehensive JSON experiment logs with full model parameters and circuit breakdowns.
  - CSV timeline export for external statistical analysis.
  - High-resolution publication/report summary cards (PNG).

---

## Quick Start

### Prerequisites

- **Node.js**: `v22.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Python**: `3.11` or `3.12` (for connectome asset preprocessing scripts)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/MachiVision.git
   cd MachiVision
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

3. **(Optional) Set up Python environment for preprocessing:**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
   ```

4. **Verify pre-built connectome assets:**
   The repository includes preprocessed connectome data in `data/processed/full-model.json` and binary CSR graph buffers in `public/models/`. If rebuilding from raw FlyWire sources:
   ```powershell
   .\.venv\Scripts\python.exe scripts/prepare_real_connectome.py
   .\.venv\Scripts\python.exe scripts/prepare_brain_surfaces.py
   .\.venv\Scripts\python.exe scripts/attach_visual_columns.py
   .\.venv\Scripts\python.exe scripts/prepare_full_connectome.py
   ```

---

## Running the Application

### Development Mode

Run the Next.js development server:
```bash
npm run dev
```

Or run both Next.js and the optional background API concurrently:
```bash
npm run dev:all
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in any modern browser (Chrome, Edge, Firefox, or Safari).

### Production Build

```bash
npm run build
npm start
```

---

## Validation & Testing

Run the automated test suite covering synaptic integration, deterministic controls, score scaling, and worker message passing:

```bash
# Run 26 unit tests (vitest / tsx)
npm test

# Type-check TypeScript code
npx tsc --noEmit

# Probe full model binary assets
npx tsx scripts/probe-full-model.ts
```

---

## Simulation Mechanics & Experimental Controls

| Component | Specification | Description |
| :--- | :--- | :--- |
| **Neurons** | 139,248 (Full brain) | FlyWire FAFB v783 annotated connectome. |
| **Connections** | 15,090,883 | Fixed synaptic weights derived from electron microscopy synapse counts. |
| **Photoreceptors** | 8,653 mapped | R1–R6 mapped to L1–L3 lamina cartridges; R7–R8 mapped to medulla columns. |
| **Tonic Lamina Drive** | 12 mV baseline | Simulates baseline tonic depolarization in early visual interneurons. |
| **Integration** | LIF ($dt = 0.2\text{ms}$) | Leaky integrate-and-fire model with 50ms observation windows ($20\text{ Hz}$). |
| **Display Anchors** | 18,940 neurons | Sampled anchor points for 3D real-time WebGL rendering. |

### Experimental Controls

- **Normal Wiring (Default)**: Authentic FlyWire synaptic connections and signs.
- **Shuffled Wiring**: Seeded randomized connectivity preserving individual in/out degree distributions to test structural specificity.
- **Disconnected Receptors**: Ablates photoreceptor output synapses to isolate spontaneous baseline and tonic network activity.
- **Black Image Input**: Zero luminance stimulus to measure spontaneous circuit activity.
- **Mirrored Image**: Inverts horizontal spatial layout to test directional asymmetry.

---

## Repository Structure

```
MachiVision/
├── app/                      # Next.js App Router (pages, layout, styles)
│   ├── page.tsx              # Main Connectome Lab interface
│   ├── methodology/          # In-app scientific methodology documentation
│   └── globals.css           # Design system tokens and cinema styles
├── components/               # React UI & 3D Visualization components
│   ├── Brain.tsx             # Three.js 3D connectome & neuropil viewer
│   ├── CinemaScreen.tsx      # Perspective-corrected stimulus display
│   └── BrainCanvas.tsx       # Canvas drawing helpers
├── lib/                      # Core simulation engine & Web Workers
│   ├── live.worker.ts        # Full-brain Web Worker for custom video stimuli
│   ├── preset.worker.ts      # Web Worker for preset stimulus streaming
│   ├── full-engine.ts        # Connectome graph traversal & LIF dynamics
│   ├── photoreceptors.ts     # Visual column & ommatidia projection
│   ├── cues.ts               # Optic flow, contrast, and looming extraction
│   └── types.ts              # Data contracts and TypeScript interfaces
├── public/                   # Static assets, models, and demo media
│   ├── models/               # Binary CSR connectome assets & brain meshes
│   ├── demo/                 # Test stimuli (e.g. moving-dot.webm)
│   └── *.png                 # Brand assets and logos
├── scripts/                  # Connectome ingestion, CSR generation, and test scripts
├── tests/                    # Vitest / tsx automated test suite (26 tests)
└── docs/                     # Detailed scientific & technical documentation
    ├── FULL_MODEL.md         # Full 139k-neuron model specifications
    ├── METHODOLOGY.md        # Mathematical equations and biological constraints
    └── DATA_SOURCES.md       # FlyWire FAFB v783 dataset provenance
```

---

## Scientific Disclaimers & Limitations

1. **Computational Model, Not Biological Recording**: MACHIVISION simulates neural depolarization and spike generation using fixed-weight leaky integrate-and-fire equations over anatomical connectivity. It is not an *in vivo* calcium imaging recording or electrophysiology measurement.
2. **Simplified Early Vision**: Early visual processing uses simplified linear luminance and a 10ms filter; it does not model non-linear photoreceptor adaptation, UV spectrum channels, or full graded-potential dendritic computations.
3. **No Synaptic Plasticity**: Synaptic weights remain fixed throughout simulation. There is no Hebbian learning, long-term potentiation, or behavioral feedback loop.
4. **Not a Measure of Emotion or Consciousness**: The Neural Activity Score strictly quantifies the proportion of model neurons that fire action potentials within an observation window. It does not measure valence, preference, pleasure, or conscious experience.

---

## References & Acknowledgments

- **FlyWire Connectome**: Dorkenwald et al., *Neuronal wiring diagram of an adult brain*, Nature (2024). [flywire.ai](https://flywire.ai/)
- **Visual Column Mappings**: Based on published Drosophila medulla and lobula columnar organization datasets.
- Built with **Next.js**, **Three.js**, and **TypeScript**.

---

## License

This project is licensed under the [MIT License](LICENSE).
