# Dynamics audit — 2026-09-17

Historical audit of the previous 10,266-neuron unsigned subset. The app now uses an expanded signed pathway model and reference normalization; see [current methodology](METHODOLOGY.md). The numerical results below describe the historical graph only.

Reproduced on the bundled 10,266-neuron, 375,726-edge graph using synthetic feature probes (`scripts/audit_dynamics.py`). These are numerical checks, not recordings of fly responses.

The previous update added 0.65 times old activity AND 0.65 times recurrent input. Its estimated dominant eigenvalue was 1.0766, above 1. All-positive feedback amplified small inputs until clipping created a fixed point:

| Probe | Original dopamine activity | Original active count (>0.2) |
|---|---:|---:|
| Weak drive (all driving features 0.1), 12 seconds | 64.346 | 7,280 |
| Strong drive (all driving features 1), 12 seconds | 64.818 | 7,709 |
| 20 seconds of zero input after strong drive | 64.207 | 6,965 |
| All 216 visual seeds forced to 1, original steady state | 64.818 | 7,709 |

Thus the 64 plateau and roughly 7.5k plateau are artifacts of the original dynamics, not biological ceilings. No constant in the score caps it at 64. Dopamine activity is 100 times the mean activity of the 59 dopamine-annotated cells, and Dopamine high is its maximum sampled value. Active count applies a 0.2 threshold; full activation of all neurons is not an intended target.

The corrected recurrent contribution includes `(1-decay)`. With default settings, the no-input infinity-norm contraction bound is 0.8775 per 50 ms step. In the same strong-drive probe the corrected dopamine activity settles near 0.010 / 100, with 216 neurons above 0.2; after one second of silence dopamine activity is about 0.001, with zero neurons above 0.2. The low values reveal weak transmission from the selected visual seeds to dopamine cells under full-graph weight normalization. They have not been rescaled to look impressive. This remains an uncalibrated unsigned rate model; real connectivity alone does not validate its dopamine metric.

The previous long ramp was primarily recurrent amplification. Finite decay and hop-by-hop propagation still introduce short delays. Only visual features are analyzed: semantic events, narrative climax, reward and subjective excitement are not recognized. The live metric can decrease; the recorded maximum intentionally cannot.
