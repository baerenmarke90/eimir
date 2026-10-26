# #1444 — HTTPS Google Photos Picker test, browser-only operator flow

**Status:** Standalone operator test harness, not an eimir. product feature or evidence of a successful provider transfer. On 2026-10-26 the operator reported an isolated Docker/NPM deployment; a read-only public `GET /` confirmed the form and the old `Referrer-Policy: no-referrer` header. Google authorization, photo transfer and remote cleanup have not been verified.

This is an **alternative** to the local Desktop test in [1444-google-picker-probe.md](1444-google-picker-probe.md). The person performing consent needs only a browser. Codex Cloud can develop and run offline tests, but Codex task containers **do not automatically provide a public, stable HTTPS OAuth callback**. For a genuine Google login deploy the optional service to an **operator-controlled, publicly reachable HTTPS test host**, separate from eimir. production.

## Operator browser flow

1. Open an HTTPS test subdomain and enter a separately provisioned, high-entropy operator secret in a POST password form (not a URL).
2. The standalone service uses Google's official Python OAuth Web client (PKCE + state, online-only) and requests only the Google Photos Picker readonly scope. The browser visits Google's own sign-in/consent page.
3. Google redirects to the **same test host** at /oauth/callback; a Secure, HttpOnly, SameSite=Lax cookie, one-time state and in-memory session bind the response to the initiating browser.
4. A successful callback opens a one-item Google Photos Picker session. Select **one synthetic JPEG**, then return to the test page and press **I have finished selecting**.
5. The server checks the selected item, transfers at most 25 MiB into a bounded memory-only stream, discards it without writing to eimir. or disk, and tries to delete the Google session.
6. Explicit cancellation, errors and ten-minute expiration likewise discard the local token and attempt session cleanup.

No photos enter eimir. storage, no provider keys enter the Web bundle, and no standing Google account connection is established. This does not approve persistent copying or partner sharing under Google's policies.

## One-time prerequisites (operator, not the end user)

- Dedicated publicly reachable **https://fotos-test.reiswienudel.de** with valid TLS. Configure a trusted reverse proxy that **does not log OAuth callback query strings**.
- Google Cloud project with Google Photos Picker API enabled; OAuth consent configured with a dedicated test user and **Web application OAuth client**. Register the exact HTTPS redirect URI **https://fotos-test.reiswienudel.de/oauth/callback**.
- Google's OAuth **Web client JSON** in a protected file or secret volume outside the repository and container image, and a separately generated unpredictable operator access secret (at least 32 characters). No credentials in Git, chat or GitHub Actions logs.
- Python 3.12+ on the operator's test server, with developer-only Google OAuth SDK google-auth-oauthlib==1.5.0 (Apache-2.0). This dependency is not part of production eimir.
- One account containing only synthetic test photos and the ability to complete Google OAuth from a normal browser. Do not use personal photos.

## Test-server setup (server operator)

These commands run on the **cloud test host**, not on the laptop or phone of the consenting user:

~~~bash
python3 -m venv /opt/eimir-google-picker-probe-venv
/opt/eimir-google-picker-probe-venv/bin/pip install "google-auth-oauthlib==1.5.0"

export EIMIR_GOOGLE_PHOTOS_PROBE_ENABLED=1
export EIMIR_GOOGLE_PHOTOS_PROBE_ORIGIN="https://fotos-test.reiswienudel.de"
export EIMIR_GOOGLE_PHOTOS_PROBE_WEB_CLIENT_FILE="/run/secrets/google-photos-web-client.json"
export EIMIR_GOOGLE_PHOTOS_PROBE_OPERATOR_KEY="REPLACE_WITH_PRIVATE_RANDOM_256_BIT_VALUE"

/opt/eimir-google-picker-probe-venv/bin/python scripts/google_photos_picker_web_probe.py --port 8787
~~~

Configure the TLS reverse proxy for that dedicated hostname to forward to **127.0.0.1:8787**, preserving the external Host, path, query string and cookies. Disable access logs of request URI/query in **every ingress/proxy layer**, specifically for the OAuth callback. The service already suppresses its own request access logs and never prints tokens. The TCP listener must **never** be directly internet-accessible.

The probe **refuses startup** unless explicitly enabled and configured with an HTTPS origin, a matching Web-client redirect URI, private Web-client JSON and a sufficiently long operator secret. Only one test is active at a time. Do not use eimir.'s login/OIDC session or expose this as an eimir. Cloud core/API endpoint.

Codex can implement and test this service in its cloud coding environment. **A normal Codex task is not itself the deployed HTTPS callback server**. A separately configured operator test host and Google Console Web client are still necessary. This PR does not provision or deploy any public endpoint.

## Existing Docker + Nginx Proxy Manager (no new hosting provider)

This is the preferred **temporary test** option when the operator already runs Docker and Nginx Proxy Manager (NPM) on the **same Docker engine**. It leaves eimir.'s canonical compose.yaml, the Arcane private test stack, and normal Cloud releases untouched. No additional tracked Compose manifest or paid PaaS is required.

**Chosen operator test hostname:** **fotos-test.reiswienudel.de**. Verify its DNS record to the existing TLS reverse proxy. Use exactly the same hostname in NPM, the Google OAuth Web client and the probe environment. Do not redirect the main reiswienudel.de website or modify the eimir. production domain.

1. In Google Cloud Console enable the **Google Photos Picker API**, configure OAuth test users, and create an OAuth **Web application** client (distinct from the optional Desktop client). Register precisely **https://fotos-test.reiswienudel.de/oauth/callback** as its authorized redirect URI, then download the Web client JSON. Use one dedicated synthetic JPEG in the test account.
2. On your Docker host place the OAuth JSON **outside Git**, readable only by non-root UID/GID **10001** (e.g. **/opt/eimir-google-photos-probe/google-web-client.json**, owner 10001:10001, mode 0400). Create a host-local **/opt/eimir-google-photos-probe/probe.env** (mode 0600) containing the four operator settings below. Generate the 64-character operator secret locally with **openssl rand -hex 32**, and never share it through GitHub, chat or copied shell logs. Do not mount any eimir. database, media or production secrets.

~~~dotenv
EIMIR_GOOGLE_PHOTOS_PROBE_ENABLED=1
EIMIR_GOOGLE_PHOTOS_PROBE_ORIGIN=https://fotos-test.reiswienudel.de
EIMIR_GOOGLE_PHOTOS_PROBE_WEB_CLIENT_FILE=/run/secrets/google-photos-web-client.json
EIMIR_GOOGLE_PHOTOS_PROBE_OPERATOR_KEY=REPLACE_WITH_64_RANDOM_HEX_CHARACTERS
~~~

3. From the exact accepted #1451 repository revision on that Docker host, build the standalone image. **Use the narrow `scripts/` directory as Docker build context** rather than the repository root, so private `.env` files and checkout data are not sent to the Docker builder:

~~~bash
docker build -f tools/ops/google-photos-picker-probe.Dockerfile \
  -t eimir-google-photos-probe:local scripts
~~~

4. Identify the running NPM container via **docker ps**. Share its network namespace to keep the test app's **127.0.0.1:8787** listener reachable by NPM **without publishing a Docker host port**:

~~~bash
NPM_CONTAINER=REPLACE_WITH_RUNNING_NPM_CONTAINER_NAME
docker run --rm --name eimir-google-photos-probe \
  --network "container:$NPM_CONTAINER" \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --memory 256m \
  --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --env-file /opt/eimir-google-photos-probe/probe.env \
  --mount type=bind,src=/opt/eimir-google-photos-probe/google-web-client.json,dst=/run/secrets/google-photos-web-client.json,readonly \
  eimir-google-photos-probe:local
~~~

   The test image runs as **UID 10001**, so the OAuth file must be readable by that UID. The host env file must be readable by the operator launching Docker (Docker injects its variables). Container-network mode depends on NPM remaining online. If NPM runs on a *different* host, do **not** use this same-namespace recipe or expose port 8787 publicly: secure an isolated internal proxy connection first.

5. In NPM create a new **Proxy Host** for **fotos-test.reiswienudel.de**. Set upstream scheme **http**, hostname **127.0.0.1**, port **8787**; enable a trusted TLS certificate and force HTTPS. The generated NPM server block already writes its own access/error logs. **Do not** try to suppress those error logs by appending another `error_log` at server level: NGINX writes to **both** when configured at the same level. Instead, the test vhost's **Advanced** field must disable normal access logs and define an **exact callback location** with an overriding location-level error log and the same NPM proxy include:

~~~nginx
access_log off;
location = /oauth/callback {
    access_log off;
    error_log /dev/null crit;
    include conf.d/include/proxy.conf;
}
~~~

   The callback location overrides the server-level error log, avoiding query-bearing diagnostics. NPM's default `location /` handles the other paths. Validate the **actual effective nginx configuration** (`nginx -t` and `nginx -T` inside the NPM container) against the version you're running. Verify that the sensitive callback path is forwarded to the probe but logged by **no** NPM layer. Also inspect upstream CDN/WAF/ingress/monitoring logging: any layer that records callback codes or state is a **stop condition**. Do not turn on unrelated request tracing or connect the test host to normal eimir. app routes. This approach follows NGINX's [location-level error-log precedence](https://docs.nginx.com/nginx/admin-guide/monitoring/logging/) and [NPM's generated proxy host template](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/templates/proxy_host.conf).

6. Open the dedicated HTTPS test address in the browser, submit your locally generated operator secret, authorize Google's limited Picker scope, and select **one synthetic photo**. Return to the test page and explicitly finish. The consenting browser user installs **nothing**. Check the sanitized result and remote-session cleanup, stop/remove the temporary container, remove the dedicated NPM vhost, revoke the Google test grant and retire the operator secret.

This is a **one-off operator test sidecar**, not a new eimir. Cloud service, a public photo importer or a persistent part of Arcane's eimir. Git Sync stack. The repository does **not** create the DNS name, Google OAuth client, secret volume or NPM vhost by itself.

## Form-origin failure and isolated rebuild

The original form response set `Referrer-Policy: no-referrer`. For a normal HTML form POST, [Fetch's Origin-header algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header) then serializes `Origin` as the literal `null`, even when the form submits to its own HTTPS origin. The app correctly rejects that non-matching origin before operator authentication or OAuth. This reproduces **Cross-origin request rejected.** on `POST /start` and would also affect `/check` and `/cancel`.

The fix uses `same-origin` only on form pages. This preserves the real origin on local POSTs while suppressing external referrers. Callback, redirect and other non-form responses retain `no-referrer` so callback codes/state cannot become a referrer, including to another local path. The login form's CSP additionally names Google's HTTPS authorization URL because browsers can apply `form-action` to the subsequent 303 redirect. Its effective redirect boundary is HTTPS plus the exact `accounts.google.com` host; CSP does not enforce source paths after redirects. Picker forms retain `form-action 'self'`. See the [CSP navigation checks](https://www.w3.org/TR/CSP3/#directive-form-action).

Origin checks, form CSRF, Secure/HttpOnly/SameSite cookies, OAuth state/PKCE and callback replay protection are unchanged. In particular, **never allow `Origin: null`, rewrite/erase `Origin` at NPM, trust a Google `Referer` instead of state, or add wildcard CORS headers**. OAuth's cross-site GET callback normally has no Origin; its cookie, state and one-time SDK flow still bind it to the initiating browser.

The [NPM proxy include](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/docker/rootfs/etc/nginx/conf.d/include/proxy.conf) preserves Host and forwards proxy metadata without replacing Origin. The app compares the configured external HTTPS origin with `HTTP_ORIGIN`; it does not derive that origin from the internal HTTP transport, `X-Forwarded-Proto` or `Referer`. A Host mismatch produces **Invalid test host.**, a different failure. A successful `nginx -t` and the exact callback log-suppression location validate syntax/log handling, not browser POST semantics. Keep the existing callback location unchanged.

To replace only the operator's existing test container, set `PROBE_REVISION` to the full reviewed fix commit from PR #1451, then run this block on the Docker host. It exports only tracked source into a temporary directory, runs offline tests, builds a new image **before stopping the old test container**, and reuses the existing private files. It does not switch/reset the host checkout, run Compose/Arcane, restart NPM, publish a port or print credentials. Cancel any active synthetic-photo session before a deliberate restart; process memory does not survive replacement.

~~~bash
export PROBE_REVISION=REPLACE_WITH_FULL_REVIEWED_FIX_COMMIT
bash <<'BASH'
set -euo pipefail
set +x
umask 077
cd /root/eimir-google-picker-src
[[ "${PROBE_REVISION:-}" =~ ^[0-9a-f]{40}$ ]]
git fetch --no-tags origin test/1444-google-picker-live-probe
git merge-base --is-ancestor "$PROBE_REVISION" FETCH_HEAD
PROBE_BUILD_DIR=$(mktemp -d /tmp/eimir-google-picker-build.XXXXXX)
trap 'rm -rf "$PROBE_BUILD_DIR"' EXIT
git archive "$PROBE_REVISION" scripts \
  tools/ops/google-photos-picker-probe.Dockerfile \
  tools/ci/test_google_photos_picker_probe.py \
  tools/ci/test_google_photos_picker_web_probe.py \
  | tar -x -C "$PROBE_BUILD_DIR"
python3 "$PROBE_BUILD_DIR/tools/ci/test_google_photos_picker_probe.py"
python3 "$PROBE_BUILD_DIR/tools/ci/test_google_photos_picker_web_probe.py"
PROBE_IMAGE="eimir-google-photos-probe:fix-${PROBE_REVISION:0:12}"
docker build --pull --no-cache \
  -f "$PROBE_BUILD_DIR/tools/ops/google-photos-picker-probe.Dockerfile" \
  -t "$PROBE_IMAGE" "$PROBE_BUILD_DIR/scripts"
test -f /opt/eimir-google-photos-probe/probe.env
test -f /opt/eimir-google-photos-probe/google-web-client.json
test "$(docker inspect --format '{{.State.Running}}' npm)" = true
if docker container inspect --format '{{.Id}}' eimir-google-photos-probe >/dev/null 2>&1; then
  docker stop --time 20 eimir-google-photos-probe >/dev/null
fi
if docker container inspect --format '{{.Id}}' eimir-google-photos-probe >/dev/null 2>&1; then
  docker rm eimir-google-photos-probe >/dev/null
fi
docker run -d --rm --name eimir-google-photos-probe \
  --network container:npm \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --memory 256m \
  --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --env-file /opt/eimir-google-photos-probe/probe.env \
  --mount type=bind,src=/opt/eimir-google-photos-probe/google-web-client.json,dst=/run/secrets/google-photos-web-client.json,readonly \
  "$PROBE_IMAGE"
curl --fail --silent --show-error --max-time 20 \
  --retry 5 --retry-delay 1 --retry-connrefused \
  --dump-header - --output /dev/null https://fotos-test.reiswienudel.de/ \
  | awk 'tolower($0) ~ /^(http\/|referrer-policy:|content-security-policy:)/'
BASH
~~~

The public root must now report `Referrer-Policy: same-origin` and the login form's CSP must contain the Google HTTPS authorization URL. Reload the root page before submitting the operator secret so the browser receives the corrected policy. If the old header persists, check the deployed image/extra ingress headers without dumping environment files, full container inspection, callback URLs or browser cookies. A passing root/header check proves deployment of this fix only; real consent, selected photo transfer and provider-session deletion still need separate operator verification.

## Safety and cleanup

- Cookie: Secure, HttpOnly, SameSite=Lax, short-lived, random. OAuth callback state is checked before exchanging any token; only one callback is consumed.
- POST operations use an independent CSRF token; operator login is rate-limited and no GET URL conveys the access secret.
- OAuth tokens and Picker session IDs remain in a single volatile process. Expiry triggers session cleanup. No DB, file, analytics or browser cache.
- Strict trusted Google OAuth, Picker and media hosts; no cross-host redirects with bearer tokens; bounded JSON and photo-byte reads; no automatic retries or background synchronization.
- Reverse proxy must redact/suppress OAuth callback URLs from logs. Shut down the test service and revoke the test grant afterward.
- Production remains blocked by Google's actual permitted-use/persistent sharing approval, Web/Capacitor device acceptance and [#797](https://github.com/baerenmarke90/eimir/issues/797).

## Automated tests and live evidence

~~~bash
python3 tools/ci/test_google_photos_picker_web_probe.py
python3 tools/ci/test_google_photos_picker_probe.py
~~~

These deterministic tests run in GitHub CI **without secrets/network**. They prove callback state, cookie, CSRF, host restrictions, selected photo transfer boundary and cleanup logic **only under mocks**.

After a real browser test, record the date, OAuth Web client type, successful or denied consent, selected test photo download and remote session cleanup status in #1444. Never include Google codes, client secrets, access tokens, Picker URLs, photos or account identities.

**Official sources:** [Google OAuth Web server](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Picker sessions](https://developers.google.com/photos/picker/guides/sessions), [Picker REST](https://developers.google.com/photos/picker/reference/rest), [Picker media items](https://developers.google.com/photos/picker/guides/media-items), [Google Photos API policy](https://developers.google.com/photos/support/api-policy).
