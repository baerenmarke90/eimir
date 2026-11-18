# Central Daily Quote service

eimir. Cloud and Self-Hosted use the existing Space-level `daily.quote` Pro
check. When Motivation is selected or all categories are eligible, the eimir.
backend can request today's Mentria quote in the account's app language.
The central service uses its own UTC publication date. German and English
are two renderings of the same entry. The service selects consecutive entries
by stable ID order and wraps after the last entry. It accepts no date selector.

Without a configured service, on service failure, or for other category
selections, eimir. uses its existing local quote resolver. The quote toggle,
personal category preferences and local Pro enforcement continue to apply.
Self-Hosted operators opt in. Offline license checks remain local.

## Quote service deployment

1. Create a private directory such as `/srv/eimir/quotes` on the operator host.
   Copy the prepared `eimir-pro-mentria-quotes.json` into it. Keep the full
   license text, source revision and translation notice in that file. The
   [pinned Mentria dataset][source] declares Apache-2.0. The displayed
   attribution includes Mentria, the license identifier, and the German
   translation notice when applicable.
2. Generate one scoped access token for Cloud and one per authorized
   Self-Hosted installation. Run this command in a private operator terminal.
   Put the first line in that backend's secret configuration and append the
   second line to `/srv/eimir/quotes/tokens.sha256`, one digest per line.
   Retain the digest-to-installation association in the operator's records.

   ```sh
   python -c 'from hashlib import sha256; from secrets import token_urlsafe; t = token_urlsafe(32); print(t); print(sha256(t.encode()).hexdigest())'
   ```

3. Make the directory and files readable to the container user (UID 10001).
   Start a separate process from the built eimir backend image with a
   read-only mount. Use the published digest for that image once available.

   ```sh
   docker run --detach --restart unless-stopped --name eimir-central-quotes \
     --publish 127.0.0.1:8097:8000 \
     --mount type=bind,source=/srv/eimir/quotes,target=/run/eimir/quotes,readonly \
     "$EIMIR_BACKEND_IMAGE" uvicorn eimir.quotes.central_service:create_app \
     --factory --host 0.0.0.0 --port 8000 --no-access-log
   ```

4. Proxy only `GET /v1/daily-quote` from a dedicated HTTPS origin to
   `127.0.0.1:8097`. Forward the Authorization header. Disable response
   caching and keep Authorization headers out of proxy logs. An authenticated
   request with `?locale=de` or `?locale=en` returns the current date, entry
   ID, requested locale and text. A missing or unknown token returns 401.
5. Configure each authorized eimir. application backend with its own
   `EIMIR_DAILY_QUOTE_SERVICE_TOKEN` and the HTTPS origin (without a path)
   in `EIMIR_DAILY_QUOTE_SERVICE_URL`, then recreate the API container. These
   settings are both empty by default. Keep the service token separate from
   the signed offline license, end-user tokens and purchase credentials.

The service reads its files at startup. Restart it after private catalog
updates or access changes. Revoke a token by removing its digest and
restarting the process. Installations cache a successful response in memory
for the publication day and locale. A revoked installation may still show
the quote it already fetched for that day.

The operator service receives only the installation's scoped bearer token
and requested language. Each response contains one translation of one quote.
There is no database, upstream quote API, public catalog endpoint or catalog
mount in the regular eimir. Cloud or Self-Hosted application containers.

[source]: https://huggingface.co/datasets/mentriaai/motivational-quotes/tree/00cc851eefc94aedb3a3b32f4cc63ed3a48dfb86
