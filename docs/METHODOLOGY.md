# MACHIVISION model and boundaries

## Anatomical data and visual inputs
The default subset contains 18,940 FlyWire FAFB v783 neurons and 326,400 directed edges, with 1,128 selected sensory inputs (1,024 T4/T5 and 104 LC4) and 1,535 dopamine-positive annotations. It preserves neuron IDs, raw synapse counts and source annotations. The subset is incomplete; it does not reconstruct the complete retina–lamina–medulla pathway.

Published [FlyWire v783 column assignments](https://storage.googleapis.com/flywire-data/codex/data/fafb/783/column_assignment.csv.gz) map 984 of the selected T4/T5 neurons after exact ID, type and hemisphere checks. The file SHA256 is bdf4ce7f62cc63493d53eefad3816ff2dfd08b190e97b35a492e0e453df2f0f6. Run `scripts/attach_visual_columns.py` after regenerating the graph, then `npx tsx scripts/calibrate_response.ts`.

Column coordinates are projected onto two flat image halves, using the column lattice extent; this projection is an assumption, not calibrated eye geometry or measured visual angles. Missing columns receive zero direct retinal input rather than a fabricated field. They can still receive synaptic input.

In addition, 475 mapped Mi1 (ON) and 22 mapped Tm1 (OFF) neurons receive positive/negative changes in local filtered luminance. This functional injection approximates the missing non-directional brightness pathway and is not a reconstructed full retinal circuit. Population ON/OFF associations are supported by [Mi1 recordings](https://elifesciences.org/articles/49373/figures) and [OFF-pathway recordings](https://www.sciencedirect.com/science/article/pii/S0896627316000076); the transient filter, 150 Hz scaling, and simultaneous direct T4/T5 motion drive are engineering approximations, not fitted physiology. Uniform flashes therefore need no invented direction to activate neural inputs.

The functional image encoder bins luminance into 36 × 30 pixels, applies a 10 ms photoreceptor low-pass, local contrast, ON/OFF rectification, and a delayed correlation motion detector (30 ms). These engineering constants have not been fitted to fly recordings. T4 samples ON and T5 OFF. Subtypes a/b map front-to-back/back-to-front on each hemisphere, c upward and d downward, following [directional evidence](https://elifesciences.org/articles/24394). LC4 receives a pooled expansion cue. No additional anatomical neurons are invented.

## Fixed-synapse spiking dynamics
`fixed-synapse-lif-v4-light` follows the equations and default parameters in the [pinned Shiu model.py](https://github.com/philshiu/Drosophila_brain_model/blob/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/model.py):
- Rest/reset −52 mV, threshold greater than −45 mV.
- Membrane time constant 20 ms, synaptic time constant 5 ms.
- Refractory period 2.2 ms; directly stimulated cells have no refractory interval.
- Synaptic delay 1.8 ms; incoming impulse = raw synapse count × transmitter sign × 0.275 mV.
- External drive up to 150 Hz, with 68.75 mV input impulses.
- dv/dt = (−52 − v + g)/tau_m; dg/dt = −g/tau_s. Both freeze during refractoriness; a spike resets v and g.

Our implementation integrates the linear decay exactly within fixed 0.2 ms ticks and uses a Bernoulli approximation to Poisson stimulation per tick. This is an adaptation, not an exact reproduction or validation of the published whole-brain model. Neuron-ID seeds make input randomness reproducible; they no longer invent receptive fields, conduction delays or membrane constants. Simulated recurrent networks are not guaranteed to fall silent after stimulation.

ACh is excitatory, GABA/glutamate inhibitory, and unknown/monoamine-only annotations have zero fast-current sign; target receptor effects are unavailable. Mixed labels use their annotated fast transmitter. Normalized weights remain in source data for provenance but are not used for LIF propagation. The depth setting restricts enabled nodes; it is not the number of propagation steps per frame.

There is no synaptic learning, reward, habituation, or plasticity. Transient membrane, synaptic and visual-filter state is necessary to simulate responses over time; it does not modify connectivity.

## Measurements and controls
Each observation usually spans 50 ms (250 integration ticks). Spiking neurons counts cells with at least one modeled spike during that window, not a smoothed or monotonically increasing population. Rate is spike count divided by actual integrated seconds. Exports include voltageMv, spikeCounts, rateHz, depolarizationMv, spikeEvents (neuron index and seconds since model reset), windowSeconds and simulationTimeSeconds. Glow clips rate/150 to [0,1]; clipping affects rendering only. The inspector reports raw Hz, mV and counts. A structural path is not proof of spike causation.

Preset results stream from the first observation, with an inline progress count while the remaining timeline computes. Playback stops at the computed frontier; changing preset cancels the old run. The two most recently completed runs are cached by graph, preset, control and parameters. The initial graph load is the only full-screen loader. Sparse integration visits only neurons touched by input or synapses, in the original index order, without a numerical silence cutoff.

Browser controls restart the simulation with the same input seeds and physical measurement units:
- No input: black frames.
- Disconnected inputs: remove outgoing edges of all directly driven T4/T5, LC4, Mi1 and Tm1 cells; direct sensory responses remain.
- Shuffled wiring: deterministically shuffle edge targets with seed 20260922, preserving source edges/counts and the target-ID multiset, allowing self/parallel edges.
- Mirrored image: horizontally reflect pixels before feature extraction.

Tests check qualitative direction selectivity, ON/OFF channel routing, missing-column handling, delays, inhibition, refractoriness, fixed weights, reproducibility and browser/backend reference agreement. No held-out electrophysiology or experimental response curves have been fitted or validated.

## Neural activity score and dopamine-cell measurements
The activity score is 100 × spiking neurons / all simulated neurons in each observation window, bounded between 0 and 100 without novelty weighting or per-video normalization. The headline is the peak activity score / 100, and the response timeline uses a fixed 0–100 axis across experiments.

Dopamine-cell activity is reported separately: population-mean positive membrane depolarization (mV above −52 mV) and actual firing rate (Hz). Depolarization is averaged across integration ticks, sampled before reset, clipped at the −45 mV threshold; refractory ticks contribute zero. It captures subthreshold excitation without claiming spikes or dopamine release. JSON and CSV retain raw membrane response, firing rates, and the 0–100 activity score.

## Playback and anatomy
Local videos are sampled at up to 20 Hz. Seeking and gaps over 200 ms reset model and visual-filter state. Skipped frames are not analyzed; event time restarts after reset. Browser feature estimation and backend OpenCV flow differ, so compare videos using the same extractor.

The brain uses 78 real neuropil surfaces. Nearest-anchor glow is a display approximation, not verified neuropil membership. Only the 18,000 strongest edges are drawn, but all retained enabled edges participate. The shuffled control displays its altered graph; it must not be interpreted as anatomical connectivity.
