# How MACHIVISION works

Video pixels pass through a functional photoreceptor and ON/OFF motion encoder, then drive selected T4/T5 neurons using published column assignments. LC4 receives an expansion cue. A fixed-synapse leaky integrate-and-fire model propagates those inputs through the retained FlyWire graph.

The display reports simulated spikes, firing rates and membrane voltages. Counts can rise or fall between observation windows; they are not a growing neuron inventory. No learning or synaptic plasticity is implemented.

The early visual pathway is an approximation, the graph is incomplete, and the simulated responses are not recordings or a validated whole-fly brain. See [full methodology](docs/METHODOLOGY.md) for equations, provenance, controls and limitations.
