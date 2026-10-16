# ADR 0004 – Android Uses Bottom Navigation at Every Window Size

**Status:** Superseded as active product guidance by [ADR 0011](0011-web-first-pwa-capacitor-mobile-delivery.md); historical context for the retired Compose client
**Date:** August 31, 2026
**Owning issue:** #352
**Amends:** `docs/INFORMATION-ARCHITECTURE.md` section 2,
`docs/SCREEN-TEMPLATES.md` section 1

**Current relationship:** Android no longer has an independent navigation implementation: the Capacitor wrapper (#1009) packages the Web product, whose mobile navigation is normative under [Product Reference v1](../product/design/product-reference-v1.md). The Android decision below described the retired Compose client. The dated Web-sidebar description below was subsequently superseded by the accepted [A1 Web shell](../design/eimir/SHELL-RESCUE-A1.md); current navigation is consolidated in [Information Architecture](../INFORMATION-ARCHITECTURE.md).

## Context

Both documents prescribed the navigation surface by window size class for every
platform: bottom navigation on Compact, a navigation rail on Medium, and a rail
or sidebar on Expanded.

Built as specified and tried on a Pixel 10 Pro Fold, that produced two poor
results on the inner display, which is 851 dp wide and therefore Expanded:

- an 80 dp rail read as a leftover strip beside 850 dp of content;
- a 240 dp sidebar, which the Expanded class explicitly allows, spent a quarter
  of the width on two destinations and was mostly empty.

Both share a cause. The rule was written for the general case of a wide window
with many destinations. This product has at most five, and on a foldable the
same app moves between 401 dp and 851 dp as the device opens. Under the rule,
the navigation surface jumps from the bottom edge to the left edge with it, so
the place the user reaches for changes with the hinge.

## Decision

**On Android, primary navigation is bottom navigation at every window size.**

The rail and the sidebar are not used. Order, labels and destination identity
are unchanged and remain shared with the Web client.

The Web client keeps its sidebar. `docs/INFORMATION-ARCHITECTURE.md` section 1
already requires shared terminology and route IDs rather than an identical
surface, and section 2 already acknowledged that platforms adapt navigation to
platform conventions. This decision makes that adaptation explicit instead of
prescribing one surface for both.

Window size classes stay. They still choose the *content* composition — list
versus list plus detail — which is what
`docs/INFORMATION-ARCHITECTURE.md` section 6 describes and what S2 onwards will
use. Only the navigation surface stops varying.

## Consequences

- `AppShell` renders one navigation surface. The rail and sidebar code is
  removed rather than left unreachable.
- Thumb reach is identical folded and unfolded, and the full width goes to
  content on the inner display.
- `docs/INFORMATION-ARCHITECTURE.md` section 2 and `docs/SCREEN-TEMPLATES.md`
  section 1 are updated with this ADR.
- Android and Web now differ in navigation surface. That is a deliberate
  platform adaptation, and the M5 parity gate compares destinations, order and
  route identity rather than the surface that renders them.
- If a later Android surface genuinely needs a rail — a tablet-first layout with
  many destinations — it needs its own decision rather than a quiet return.

## Alternatives considered

**Keep the rail and improve it.** Correct insets and vertical centring did make
it look intended, and it stayed within the documents. Rejected: it does not
address the reach changing with the hinge, and the strip still competes with
content for width it does not need.

**Keep the sidebar for Expanded only.** Allowed by the documents as written and
the better of the two. Rejected for the same reason, and because 240 dp for two
to five destinations is width the content should have.
