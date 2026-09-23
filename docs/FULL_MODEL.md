# Full photoreceptor-driven model

Browser presets and local videos use the full annotated FlyWire v783 model: 139,248 neurons, 15,090,883 source connections, no hop cutoff, fixed synapses. The default synapse-count threshold is 1. The smaller 18,940-neuron graph is a display sample, not the simulated population.

Run `scripts/prepare_full_connectome.py` after the source-data setup scripts in the README. It verifies source SHA-256 hashes and emits immutable binary CSR assets and a manifest. It preserves all positive-count connections whose endpoints have annotations; 1,100 source connections are excluded. Browser workers verify asset hashes.

8,653 of 11,118 photoreceptors have usable receptive-field mappings. R7/R8 use published column assignments; R1–R6 use the winning synapse-weighted L1/L2/L3 column. The generated `photoreceptor-mapping.json` records the method and winning fraction. Unmapped cells remain in the circuit but get zero direct image input. Flat image projection is an assumption, not a calibrated visual field.

Linear RGB luminance drives mapped receptors with a 10 ms filter and saturating 30 × light / (0.02 + light) mV input. L1–L5 receive fixed 12 mV tonic drive. These are explicit hypotheses; RGB cannot reproduce UV sensitivity. T4/T5, Mi1/Tm1 and LC4 are not directly stimulated by diagnostic motion/looming features.

The model uses 0.2 ms LIF integration, −52 mV rest/reset, −45 mV threshold, 20/5 ms membrane/synaptic constants, 1.8 ms delay and 2.2 ms refractory interval. Histamine, GABA and glutamate have inhibitory fast-current signs; acetylcholine is excitatory. Monoamine/unknown outputs have no modeled fast current. Applying LIF spikes to graded early visual neurons is an approximation. No synapses learn or adapt, and no scrolling policy exists.

## Score and measurements

**Activity score = 100 × neurons with at least one spike / all simulated neurons**, per observation window. It is bounded to 0–100 and uses no novelty term, learned preference, or per-video maximum normalization. The headline is the peak score; the timeline uses a fixed 0–100 axis. Compare equal observation durations and parameters. Baseline tonic activity can contribute to the score.

Population firing rates, positive membrane depolarization, and dopamine-labelled cell measurements remain separate. They are not dopamine release or enjoyment. Network and circuit aggregates cover every simulated neuron. Per-cell snapshots and raster events cover the display sample. Inspector paths also cover only that sample; lack of a displayed path does not establish full-model disconnection.

## Runtime and validation

Loaded connectivity is reused between presets. Observations stream while computation continues. Video playback waits between samples when the worker is busy; full-brain simulation can be slower than real time. Seeking resets state. An optional analytical passive integrator is regression-tested against the default sparse tick integrator but is not enabled by default because it was slower in local benchmarks.

Tests check mapping, signed propagation, disconnected inputs, fixed wiring, full-population aggregates, score endpoints and numerical integration. These are engineering checks, not validation against measured fly response curves. This is a full annotated brain release, not an embodied fly or complete nervous system.

The optional Python/OpenCV batch API remains a separately labelled legacy subset reference engine. It is not used by the browser full-model video workflow.
