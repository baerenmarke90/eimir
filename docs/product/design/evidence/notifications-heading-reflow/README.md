# More notification heading reflow

The Android test.28 source gate exposed a repeatable WCAG 1.4.10 regression in the
accepted More utility typeface. At 1280 × 1024 with root CSS zoom 4, the long German
notification heading made its grid track 310.324 CSS px wide. The document
overflowed to 1305 px in a 1280 px viewport in both Light and Dark.

Allow the existing More page heading to wrap with `overflow-wrap: anywhere`.
Retain Instrument Sans, its size/weight and the shared page/heading/action
hierarchy. This restores the existing compact/reflow contract without clipping,
hiding content, reducing the font or changing a test assertion/tolerance.

## Authority and product review

This is a bounded correction to #1518's already generated and accepted
[More composition](../../references/more-modern-diary-2026-10-30.png), Product
Reference v1 utility/Settings direction and the existing shared PageHeader.
No new feature, composition, interaction, typing burden or business capability is
introduced. Existing Compact-first semantic tokens, reduced motion and readable
content/action hierarchy apply. Wrapping is only needed when space is insufficient.

Reuse: the browser's standard CSS word wrapping and the existing More selector.
No dependency, provider or new component. No business/freemium impact: accessible
reading remains non-paywallable, with no entitlement, owner, Cloud/Self-Hosted,
resource cost, quota, retention, downgrade, export or matrix change. No auth,
privacy, cache, API, concurrency, lifecycle, schema or deployment change.

## Verification

The original product-reflow fixture, mocks and horizontal-width/clipped-control
assertions were reused in direct production-browser diagnostics. The baseline
reproduced 1305 > 1280 in both themes. With this exact one-property correction,
all 13 original surfaces passed at 400% in each theme, plus notifications at
320/390/1440/1920 px in each theme: **34 checks passed**, no unexpected API calls.
This diagnostic uses the available Chromium/Playwright runtime and supplements
the required pinned GitHub browser suite; it does not replace that gate or claim
axe/physical-device acceptance.

The original CI source run passed all 588 PR-critical browser cases and 178 of
180 additional cases; only the Light/Dark 400% overflow cases failed, including
their existing automatic retry. A code correction requires fresh source checks.
No old success is copied, no failed workflow is blindly retried, and no timeout,
retry, test group, tolerance or assertion is relaxed.

## Visual evidence

- [390 px Light](notifications-390-light.png)
- [1280 px Dark at 400%](notifications-400-dark.png)

At 400%, vertical scrolling remains expected; the long heading wraps within the
content width and controls remain horizontally reachable. Images use synthetic
fixture data. Real phone installation and native accessibility remain separate.
