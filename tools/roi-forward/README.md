# fNIRS forward-model explorer

November 2026 | Eli Bulger

## Local test

1. Extract the ZIP and open a terminal in `roi-forward`.
2. Run `python -m http.server 8000` (or `py -m http.server 8000` on Windows).
3. Open http://localhost:8000/ in a recent Chrome, Edge, or Firefox browser.

The page must be served over HTTP rather than opened directly from disk. The bundled gzip model is automatically decompressed in browsers supporting DecompressionStream. No Python packages or server-side prediction code are required.

## Contents

- `index.html`, `app.css`, `js/`: website prototype.
- `data/surface.bin`: original simplified anatomical brain surface.
- `data/layout.json`: original 378-channel FieldTrip layout.
- `data/model.bin.gz`: complete supplied sparse `J_chrom_brain_sparse` (756 x 291612), 145806 gray-matter nodes, 3549083 retained coefficients, stored in CSC format with float32 values. No further pruning or effective HbO weighting was applied.
- `data/validation.json`: nine reference predictions calculated directly from the supplied MATLAB sparse matrix at double precision.

## Prediction

The model receives two wavelength-specific absorption vectors (760 and 850 nm, mm^-1), each ordered by gray-matter node. Output rows are 378 HbO values followed by 378 HbR values. The spherical ROI is unchanged. Each selected node is assigned the specified absorption changes; all other nodes are assigned zero. Predictions are computed by direct multiplication of the full sparse Jacobian by the stacked absorption vector, without any additional spectral conversion or effective HbO weighting.

The single logarithmic slider controls the 850 nm absorption change from 1e-5 to 1e-3 mm^-1 (default 1e-4 mm^-1). The 760 nm absorption change is scaled by 6.18e-7 / 9.95e-5, using the task-scaled values reported in Section 2.2 of Measurement prediction and power analysis for fNIRS and DOT (https://pmc.ncbi.nlm.nih.gov/articles/PMC13326666/). The topography displays HbO; HbR is computed internally. The 760 nm value is displayed below the slider.

The JavaScript predictor reproduced the reference predictions for both chromophores in all nine tests (maximum absolute error 1.23e-9 uM); this verifies implementation against the supplied sparse matrix, not the original dense matrix. At the default left-temporal ROI, peak absolute predicted HbO is 0.05464 uM. Channel ordering remains an assumption to verify against original model metadata. The intended GitHub Pages location is `tools/roi-forward/`. No repository changes have been made.
