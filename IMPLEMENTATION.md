# FlyVision implementation status

## Current requested revision

- Real FlyWire FAFB v783 subset is the default for both Next.js and Python: 10,266 real neuron IDs, 375,726 recorded connections and source-derived anchor coordinates.
- Pinned original-author connectivity and official annotation downloads are present locally. Reproducible builder and provenance hashes are included. Missing data fails explicitly; synthetic connectivity is not an automatic fallback.
- Upload MP4 or WebM, analyze with OpenCV plus the real sparse graph, then play a transcoded H.264 preview with synchronized metrics and activity.
- Compact brain on the right, live metrics beneath it, larger stimulus on the left. One overall excitement score summarizes the whole clip. The detailed timeline and real-path inspector are expandable.
- Final report and PNG result card show one overall score. It is explicitly modeled visual activation, not emotion or enjoyment.
- `npm run dev:all` launches both services. Local media previews are ignored by git and expire after 24 hours on subsequent uploads.

## Verification

Real MP4 upload via the Next.js proxy returned 60 frames, real-source metadata and a playable media URL. Browser upload, real-data label, final score, playback and synchronized metrics were checked. Tests cover original model behavior plus real subset integrity, input cell roles, descending paths, score formula and import ID preservation.

## Limits

This is a bounded unsigned graph model, not a validated biological response predictor. It does not include real skeletons, receptor physiology, complete visual retinotopy, behavior prediction, human saliency, or stimulus optimization. The real coordinates are neuron anchor points. Historical synthetic calibration is not applied. Detailed biological and data limitations are documented in DATA_SOURCES.md and METHODOLOGY.md.
