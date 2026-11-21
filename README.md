# Eli Bulger — personal research portfolio

A responsive, static portfolio for **https://ebulger.github.io/**. No frameworks, build tools, APIs, or package installs are required. It works directly with GitHub Pages.

## Pages

- `/` — minimal landing page with a brief biography, personal portrait, and page links
- `/about/` — background, research interests, career milestones
- `/publications/` — verified journal/conference papers and patent, with category filters
- `/cv/` — concise web CV with a **Print / save as PDF** control
- `/tools/` — research tools and an interactive synthetic signal-processing demo

Legacy URLs (`About.html`, `CV.html`, `Other.html`, and a few nested URLs) are redirected so existing links still work.

## Publish on GitHub Pages

1. Download and extract this ZIP if you want to deploy the site manually; it can also be deployed directly through the connected GitHub repository.
2. Open the existing repository **`ebulger/ebulger.github.io`** on GitHub. Back up the existing files/branch before replacing anything.
3. Copy **the contents** of the extracted folder (including `.nojekyll`) to the root of the repository. Do not add an extra parent folder.
4. Commit the change to the branch used by GitHub Pages (`master` or `main`, depending on the repository's settings).
5. In **Settings → Pages**, confirm **Deploy from a branch**, the correct branch, and folder **`/(root)`**. You do not need a GitHub Actions workflow.
6. Visit **https://ebulger.github.io/** once GitHub Pages has deployed the commit.

For local preview, run this command in the project folder:

```bash
python -m http.server 8000
```

Then open http://localhost:8000/. You can also open `index.html` directly, although local web servers are better for testing nested pages.

## Updating the site

- Content is plain HTML in `index.html`, `about/index.html`, `publications/index.html`, `cv/index.html`, and `tools/index.html`.
- Colors, type, spacing, layout and print behavior are in `assets/css/site.css`.
- Navigation/theme/filter interactions are in `assets/js/main.js`.
- The synthetic signal explorer is in `assets/js/signal-lab.js`.
- Portrait is `assets/img/eli-portrait.png`. Replace the file with a newer photo if desired; keep the same filename or update the `<img>` URL.
- Project illustrations (`.svg`) are **conceptual/synthetic graphics**, not actual research results.
- Update the page metadata and schema in each HTML page when changing the positioning.

## Before going live: review

- **CV:** The original archive does not contain a working, current CV PDF. The new `/cv/` page therefore offers a printable summary instead of a broken PDF link. Verify or add your exact employment dates, positions, and additional skills/awards. If you provide a recent PDF, it can be linked alongside the printable view.
- **LinkedIn:** The LinkedIn page was unavailable to automated public browsing. Biographical and publication content was instead grounded in the old site, Carnegie Mellon profiles and published records. Review copy for accuracy/currentness.
- **Email:** Contact links use the academic address `elib@andrew.cmu.edu`.
- **GitHub:** The website is hosted under `ebulger`, while the publicly available `fnirs-power` research package is under `esbulger`. Both links are intentionally kept separate.
- **Portrait:** Reused the black-and-white portrait from the supplied website archive. No third-party headshot has been bundled.
- **Publication list:** A selected, verified list, not a claim of a complete bibliography. Confirm whether other works or newer preprints should be listed.

## Public sources used to verify content

- [CMU LiMN lab profile](https://www.cmu.edu/dietrich/psychology/shinn/people/e-bulger.html)
- [CMU Biophotonics lab profile](https://www.cmu.edu/bme/biophotonics/people/index.html)
- [CMU multimodal research description](https://www.cmu.edu/bme/biophotonics/research/nirs-eeg.html)
- [CMU 2022 NSERC PGS-D award note](https://www.cmu.edu/bme/biophotonics/newsfeed/index.html)
- [2026 fNIRS power paper](https://doi.org/10.1162/IMAG.a.1289)
- [2024 auditory cortex source imaging](https://doi.org/10.1364/BOE.531576)
- [2024 Optica conference paper](https://doi.org/10.1364/OTS.2024.OM3D.6)
- [2023 visual cortex source imaging](https://doi.org/10.1016/j.neuroimage.2023.120210)
- [2023 dolphin fNIRS paper](https://doi.org/10.1117/1.JBO.28.7.075001)
- [2018 materials paper](https://doi.org/10.1002/adfm.201704559)
- [2016 cellulose paper](https://doi.org/10.1007/s10570-016-1057-0)
- [2020 aerogel patent](https://patents.google.com/patent/US20200031977A1/en)
- [Public `fnirs-power` source code](https://github.com/esbulger/fnirs-power)

## Technical notes

- Site is static; demo computations run entirely in the browser. No tracking or analytics are included.
- A Google Fonts stylesheet is used for display typography, with system fonts as fallbacks.
- Keyboard navigation, semantic markup, responsive styles and reduced-motion support are included.
- `.nojekyll` disables Jekyll processing on GitHub Pages.
