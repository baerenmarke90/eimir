# Curated demo media

The files in this directory are the reproducible local media set for the canonical Lea/Alex demo. They are product-demo fixtures, not runtime downloads.

## Rules

- Add only assets whose concrete source page and redistribution license have been checked individually.
- Preferred providers are Pexels and Pixabay, but provider branding alone is **not** sufficient evidence that a file may be committed to this public repository.
- The current set uses historical Pixabay files published before **2019-01-09**. Pixabay's current terms describe those older files as CC0 content; the manifest therefore records `CC0 1.0 Universal` plus the Pixabay terms URL as the licensing basis.
- Do not assume current Pixabay or Pexels standard-license images may be redistributed as standalone repository files. Check the actual terms that apply to the selected asset before adding it.
- Avoid identifiable people, trademarks, logos, or other third-party rights unless those rights have been reviewed separately.
- Never hotlink a provider CDN from demo data. `source_page_url` is provenance only.
- Never download stock media during container startup or demo reset.

## Manifest

`manifest.json` is authoritative. Every image records at least:

- stable demo asset id and local filename;
- provider asset id and concrete source page;
- creator and source publication date;
- license name, license URL, licensing-basis URL, and check date;
- attribution requirements;
- SHA-256 and MIME type;
- German alt text and intended demo usage.

`eimir.demo.assets` validates the whole manifest, every hash, every image type, and the exact directory contents before the demo mutates its database. A validation failure aborts creation/reset before destructive work begins.

## Adding or replacing an image

1. Pick the concrete asset and inspect its source page.
2. Confirm that its applicable license permits committing and redistributing the image in this public repository.
3. Record the real provider id, creator, publication date, source page, license, and check date. Do not invent metadata.
4. Download the chosen file once and place it in `images/` with a stable descriptive filename.
5. Compute SHA-256 for the exact committed bytes and add/update the manifest entry.
6. Add meaningful `alt_text_de` and `usage_context` values.
7. Run `uv run python -m scripts.demo_space validate-assets` from `backend/`.
8. Run the demo unit/integration tests and verify reset removes old provider objects before rebuilding the canonical assignments.

## MediaStore and reset

The local files are input fixtures only. Seeding uses the normal Eimir attachment lifecycle: upload registration, product MIME/size checks, MediaStore write, finalize, image decoding/sanitization, thumbnailing, READY state, and normal parent binding. There is no demo-specific media store.

Reset detaches canonical and visitor-added demo media, purges their normal MediaStore objects, deletes the verified demo Space, and imports the same hash-pinned local assets again. No provider network access is required.
