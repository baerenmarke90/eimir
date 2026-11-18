# Product preview for eimir.de

The public site (`site/`) embeds the real Web app in a phone frame: **Wir**, **Momente**
(Erinnerungen and Tagebuch) and **Eure Geschichte**. There is no server behind it. The app runs
on a recording of the public demo Space, which holds fictional data only (`docs/DEMO-SPACE.md`).

- `replay.ts` answers every `/api/v1/` request from `data/api.json` and `data/media/`. It refuses
  anything that would write. Unknown photos get one of the recorded photos, other unknown requests a 404.
- `app.tsx` mounts the real `App` with an in-memory router, seeds a signed-in session and opens
  only `/today` and `/story`. Everything else returns to Wir with a short notice.
- `preview.css` hides the tabs Planen and Mehr and every control that creates or edits.
- `index.html`, `launcher.ts` and `launcher.css` are the start page inside the frame. The app
  (about 1 MB gzipped) loads only after a tap on "Vorschau starten".
- `data/` is the recording. Re-create it with `record.mjs` (see its header) whenever the product
  changes materially, then shrink the photos to at most 900 px wide JPEGs at quality 74.

## Build

```bash
cd web
npm run build:preview    # writes web/dist-preview
```

`tools/site/build_main_site.py` copies `web/dist-preview` into `site/dist/preview` when it exists.
The container build (`site/Dockerfile`) builds it in its own stage. nginx serves `/preview/` with
its own Content-Security-Policy (`site/security-headers-preview.conf`): scripts and connections
from the same origin only, and framing from the main site only.

The preview is not part of the release bundle and is built with `vite.preview.config.ts`.
