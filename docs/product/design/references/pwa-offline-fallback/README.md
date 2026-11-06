# PWA offline fallback: delivery evidence

The privacy-safe offline fallback comes from the PWA foundation (#1040, #1041;
[ADR 0011](../../../../decisions/0011-web-first-pwa-capacitor-mobile-delivery.md)).
Its generated offline copy comes from the bundled locale registry. This evidence covers
a delivery fix, not a new composition. The accepted design in `web/public/offline.css`
is the reference, and no screen, component, token, copy or motion changes.

## Defects corrected

- The production CSP sent `manifest-src 'none'`, so browsers refused
  `/manifest.webmanifest`. It now sends `manifest-src 'self'`. `worker-src 'self'` was
  already present on `main` for the bundled video-compression module worker, and it also
  admits the service worker.
- The service worker precached `/offline.css` and `/offline-language.js` in the shell
  cache, but its static lookup only consulted the runtime cache. Offline, the
  worker-controlled fallback received errors for both and rendered unstyled and only
  in German. Static requests now fall back to the shell precache after a failed network
  fetch; online behavior is unchanged.

## Baseline and method

- Before: `main` `aa62b721a`. After: the code commit `88529d01d`, which contains that
  `main`.
- Runtime: the pinned `ghcr.io/nginx/nginx-unprivileged:1.31.7` image with the repository
  template, `NGINX_ENVSUBST_FILTER` and CSP-origin entrypoint, serving the production
  bundle from `npm run build`. Each CSP line was byte-identical to its revision.
- Browser: Chromium 151.0.7922.34 headless through Playwright 1.62.1. Each target
  installs the worker online, then the origin server is stopped before navigating to the
  deep link `/momente/42`.

## Product evidence

| State | Evidence |
| --- | --- |
| Before: `main`, English browser | [390 Light](evidence/before-offline-390-light-en.webp): unstyled, German, 17 px link |
| Offline fallback, Compact | [360 Light](evidence/offline-360-light.webp), [390 Light](evidence/offline-390-light.webp), [390 Dark](evidence/offline-390-dark.webp), [430 Dark](evidence/offline-430-dark.webp) |
| English browser locale | [390 Light](evidence/offline-390-light-en.webp) |
| Keyboard focus on the retry action | [390 Light](evidence/offline-390-focus.webp) |
| Expanded adaptation | [1280 Light](evidence/offline-1280-light.webp) |
| 320 px with 200% text | [Full page](evidence/offline-320-large-text.webp) |

## Observed behavior

- Before: the manifest is blocked by `manifest-src 'none'`. `/offline.css` and
  `/offline-language.js` fail with `net::ERR_FAILED`, the fallback uses the browser
  default serif font, and English browsers still see German copy.
- After: no CSP violation and no console error. The manifest loads without manifest
  errors. The fallback uses the designed typography and colors in Light and Dark, and
  English browsers see "No connection right now." with `lang="en"`.
- After, interaction: the 46 px retry action is focusable with the designed focus ring.
  After the server returns, the retry action restores `/` under worker control.
- After, page properties: no animations exist, so reduced motion needs no alternative.
  Caches hold only public shell files, bundle assets, fonts and icons.
- 320 px reflow at normal text size has no horizontal overflow.

## Known deviation

With 200% text at viewports of 390 px and narrower, the longest word of the German
heading is wider than the column at the heading's `1.8rem` floor: 11 px of horizontal
overflow at 390 px and up to 81 px at 320 px. This is pre-existing behavior of `offline.css`, identical on `main`.
It is recorded as a follow-up rather than changed in this delivery fix.

## Limits

- The full `web/Dockerfile` image was not built locally because the local Docker bridge
  drops host-to-container traffic. Containers therefore used host networking with only
  the `listen` lines changed.
- The Claude desktop built-in browser cannot fetch service-worker scripts at all, so it
  only confirmed the earlier CSP block.
- Real-device installation was not part of this evidence.
