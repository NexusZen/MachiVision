# Brain surface display

The anatomical volumes come from the public [fafbseg mesh archive](https://github.com/navis-org/fafbseg-py/blob/master/fafbseg/data/JFRC2NP.surf.fw.zip). These JFRC2 neuropil surfaces were transformed to FlyWire / FAFB14.1 space by the source project. Original template citation: [Ito et al. neuropil domains](https://doi.org/10.5281/zenodo.10567). See the [source documentation](https://fafbseg-py.readthedocs.io/en/latest/source/generated/fafbseg.flywire.get_neuropil_volumes.html).

`scripts/prepare_brain_surfaces.py` converts the archived meshes to the same coordinate transform as our 18,940 neuron anchors, gently smooths three passes, and reverses face winding for the reflected Y axis. The generated asset records the archive SHA-256. No source neurons or connections are removed by the renderer.

Each neuron anchor is associated with its nearest neuropil surface for display. This is an approximation: anchors do not describe all of a neuron's arbor or its synaptic neuropils. It must not be interpreted as verified anatomical membership or measured region activity. A region's display intensity is the strongest visible associated neuron's modeled activation. The dopamine score and underlying graph simulation are unchanged.

At zero activity every volume is pale sage-gray. Active medulla, lobula and lobula plate volumes tend toward yellow, green and teal-blue respectively; central regions use mint. Surface materials update on incoming activity, and rendering sleeps when idle or offscreen.
