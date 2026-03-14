# ColourVisionTest

Single-page progressive web app that measures your just-noticeable colour difference (JND, ΔE) around the hue wheel and visualises it with a radar diagram.

## Features

- Mobile-friendly single-page flow.
- Pre-test guidance for lighting, brightness (recommended 80–100%), and disabling colour-shifting filters.
- Quick grayscale/contrast display check.
- Adaptive hue-by-hue JND test with timeout handling (responses over 5 seconds count as a fail). Divider position randomises each trial and avoids the outer 10% of width.
- End-of-test average ΔE and radar chart across 24 hue segments.
- Trial feedback overlays your tap location versus the real divider for each response.
- Local result history via `localStorage`.
- Shareable compressed result payload in URL (`?r=`).
- Basic PWA support via manifest + service worker for app-like install/offline usage.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
