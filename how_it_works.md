# How FlyVision works

The app uses 18,940 real FlyWire FAFB v783 neuron IDs and 326,400 source connections. It includes 1,128 visual seeds, 1,535 dopamine-positive annotations (including mixed-transmitter labels), and all 24,972 source connections with at least five synapses into those dopamine targets. There are 12,517 distinct direct presynaptic partners. Strongest shortest visual paths are retained within five hops; 1,475 dopamine targets are structurally reachable within that bound. Other upstream/recurrent context remains incomplete. Anatomical reachability is not proof of biological response.

T4/T5 seeds receive motion, contrast and temporal-change input; LC4 seeds receive expansion and temporal-change input. Up to 64 cells per subtype and hemisphere are sampled deterministically by ID, without claiming retinotopic coverage.

## Signed dynamics

At a 50 ms reference step:
`a_next = clip(decay*a + (1-decay)*gain*W*a + sensory_input, 0, 1)`.

Weights retain normalization against each target's full incoming source synapse count. ACh is assigned +1, GABA/glutamate -1, and monoamine-only or unknown labels 0 for fast transmission. Mixed labels containing a fast transmitter use that fast-transmitter approximation. These are coarse model assumptions; the dataset has no target receptor annotations. Receptor-specific effects, dopamine release dynamics and validated kinetics are not implemented. The glutamate-inhibitory approximation follows the modeling approach discussed by [Shiu et al.](https://www.nature.com/articles/s41586-024-07763-9), with the same need for caution about receptor-dependent effects. Our stable rate model is not their validated LIF implementation.

Gain is below one and absolute incoming weights sum to at most one, bounding no-input contraction. Live decay uses elapsed video time. Default depth includes five graph hops. Unreachable context neurons have depth 99 and receive no invented input. Active count remains the number of individual activities above 0.2.

## Dopamine response index

Raw activity is `100 * mean(activity of dopamine-positive neurons)`. Exact positive comma/semicolon-delimited dopamine/DA tokens are recognized; dopamine-negative is excluded. Known annotations take precedence over predictions.

The displayed response is `100 * clamp((raw - baseline) / (reference - baseline), 0, 1)`. A fixed suite of six feature-domain references defines this scale: blank, contrast, motion pulse, looming pulse, brightness transitions, and combined visual drive. Each runs 90 steps at 20 Hz, with stimulation from steps 10 through 69; transitions pulse on two of every ten steps. Baseline is the blank peak and reference is the largest reference peak.

This is numerical reference normalization, not biological calibration or a percentile among videos. The strongest reference maps to 100; larger responses clip at 100, with raw values retained in exports. Zero-response calibrations return unavailable. A single graph/settings combination uses the same scale across videos; calibration is never fitted to the uploaded video. Model hash, settings, version, and reference peaks accompany exported results. Changing settings recalculates references in the worker. Default references are precomputed so uploading a video does not trigger that work.

Dopamine high is the maximum displayed index over analyzed playback samples. Exports retain per-frame `dopamineRaw` and `dopamine` (the index). Scores cannot measure dopamine concentration, excitement or preference. Broader inclusion does not guarantee a larger raw response.

## Playback and anatomy

Compatible MP4/WebM videos play locally with worker analysis at up to 20 Hz; frames may be skipped on slower devices. Seeks/gaps over 200 ms reset propagation. Unseen frames are not claimed as analyzed. The interpretation toggle visualizes input cues from the same video.

The brain uses 78 real neuropil surfaces in FlyWire space. Surface brightness is the strongest associated anchor activity; nearest-surface association is a visualization approximation, not verified neuropil membership. Individual metrics do not use the surface aggregation. All retained connections are simulated; only the strongest 18,000 are optionally drawn. See [surface provenance](brain-surfaces.md).

The separate batch API uses OpenCV feature extraction and the same signed update/reference definitions. Browser and backend features differ, so comparisons should use the same extractor.
