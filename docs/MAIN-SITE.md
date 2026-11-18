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

The site ships as a small container: `site/Dockerfile` builds the production bundle (and fails while the
imprint still has placeholders) and serves it with the same pinned unprivileged nginx image as the Web
app, using `site/nginx.conf` and `site/security-headers.conf`. The image answers on port 8080, sends the
security headers on every response (including redirects and 404), and exposes `/healthz`. It was checked
locally with a read-only filesystem, dropped capabilities and `no-new-privileges`.

Compose project for the Docker host, next to other projects behind Nginx Proxy Manager. It joins the
same external proxy network as the other sites (`npm_default` in the current setup) under a unique alias:

```yaml
services:
  eimir-site:
    build:
      context: https://github.com/baerenmarke90/eimir.git#main
      dockerfile: site/Dockerfile
    image: eimir-site:local
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    expose:
      - "8080"
    networks:
      npm_proxy:
        aliases:
          - eimir-site-internal

networks:
  npm_proxy:
    external: true
    name: npm_default
```

Replace `#main` with a commit SHA or tag to pin a reviewed revision. The repository is public, so no
credentials are needed. If the deployment tool does not build images, run
`docker compose up -d --build` on the host once and again after every site change.

In Nginx Proxy Manager add a proxy host for `eimir.de` (and `www.eimir.de`, redirecting to `eimir.de`)
forwarding `http://eimir-site-internal:8080`, with a Let's Encrypt certificate and "Force SSL". Enable
HSTS only after the HTTPS setup has been verified.

The imprint facts (name, address, contact) become part of the public repository when the placeholders
are replaced. They must be public on the site anyway; replace them in `site/impressum/index.html` in a
reviewed change. Until then the production build, and therefore the container build, fails on purpose.

Before relying on the site for Google OAuth verification, the privacy page
`https://app.eimir.de/legal/privacy` must be live and the final imprint must be published.
