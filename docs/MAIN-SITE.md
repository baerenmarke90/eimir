# Public main site (`eimir.de`)

Owner: [#1835](https://github.com/baerenmarke90/eimir/issues/1835).

`eimir.de` is the public front page of the product: a short introduction, a login link
to the application at `https://app.eimir.de`, and the legal pages. The application itself
runs on `app.eimir.de` (web app and API on one origin). The two are separate deployments.

## What is in the repository

- `site/index.html` (German), `site/en/index.html` (English), `site/impressum/index.html`
  (legal notice, German) and `site/assets/site.css`.
- `tools/site/build_main_site.py` assembles `site/dist/` and adds the Web app's self-hosted
  fonts (Literata, Instrument Sans) and app icon from `web/public/`, so no binary copies live
  in Git.
- `tools/ci/test_main_site.py` guards the site (see below).

The site is plain HTML and CSS without JavaScript, cookies, tracking, third-party fonts or
remote resources. Each page carries a restrictive Content-Security-Policy meta tag
(`default-src 'none'` plus same-origin images, fonts and styles).

## Design

Smartphone/Compact is the reference composition; the Expanded layout adapts the same
hierarchy (hero left, illustration right, topics as two columns). The hero reuses the rose
entry-screen gradient of the app, Literata for headings and Instrument Sans for text.
Colors use the same variable names and values as the Web design-system adapter
(`web/src/styles.css`, `web/src/theme.css`); the test fails when a value drifts. Light and
Dark follow `prefers-color-scheme`. The page has no animation beyond a color transition on the
primary button, which is disabled with reduced motion.

The primary action is one filled pill that opens the application (localized per page). Privacy and terms are the
application's public pages (`/legal/privacy`, `/legal/terms`) and are linked, not copied, so
there is a single source of truth. Product screenshots are intentionally not used yet; the
repository's older store images are outdated mockups.

## Legal notice (Impressum)

`site/impressum/index.html` contains `[[PLACEHOLDER]]` markers for the operator's name, address,
contact and responsible person. These facts come from the operator; nothing is invented. The
page is `noindex` until they are filled in, and `build_main_site.py --production` refuses to
build while any marker remains. This text is a drafting baseline, not legal advice.

## Build and preview

```bash
python3 tools/site/build_main_site.py            # development build, placeholders allowed
python3 tools/site/build_main_site.py --production   # release build, fails on placeholders
python3 -m http.server 8765 --directory site/dist
```

## Deploying

Upload the contents of `site/dist/` to the web space or server that answers for `eimir.de`
(the domain is registered at netcup, which also hosts its DNS zone). Serve it over HTTPS with the
security headers below. The pages carry their own CSP as a fallback, but only real HTTP headers can
send `frame-ancestors` and HSTS:

```text
Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; font-src 'self'; style-src 'self'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

Before relying on the site for Google OAuth verification, the privacy page
`https://app.eimir.de/legal/privacy` must be live and the final imprint must be published.
