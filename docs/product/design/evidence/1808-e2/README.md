# Suggestions and Einkauf fertig (#1808, step E2): visual evidence

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step E2 adds the suggestions from earlier
trips and the action that finishes a trip, with its end state. The page composition is steps C1 and C2, see
[`../1808-c1`](../1808-c1/README.md) and [`../1808-c2`](../1808-c2/README.md); the approved reference is in
[`../1808`](../1808/README.md).

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful mock API that
behaves like the server of step E1 (decision 0016): finishing takes the named checked entries out of the list and
keeps their titles as suggestions. Each run checks that nothing overflows horizontally and that axe finds no
violation.

| View | File |
| --- | --- |
| Suggestion chips under the entry field, Compact 390 px Light | `1808-e2-suggestions-390-light.png` |
| The cart sheet with the finish action, Compact 390 px Light | `1808-e2-finish-cart-390-light.png` |
| The list after finishing, a plain end line, Compact 390 px Light | `1808-e2-finished-390-light.png` |
| The shared moment when nothing is left to buy, Compact 390 px Dark | `1808-e2-moment-390-dark.png` |

## What the screens show

- **Suggestions.** Under the entry field a quiet row of chips lists what the couple bought before
  (`m5s3.collection.suggestions.heading`), most recent first, at most twelve. One tap adds the entry again with its
  last quantity; a chip can be removed on its own with the small cross. What is already on the list is not offered
  again. A note says where the chips come from and that only the two of them see them
  (`m5s3.collection.suggestions.note`). Chips are tinted fill only, no outline.
- **Finishing the trip.** The cart sheet (Compact) and the inline cart section (Expanded) end with the filled action
  `m5s3.collection.finish.action`. It names the entries of the cart the person sees; the server takes the ones that
  are still checked, so a repeat or the partner finishing at the same moment changes nothing. It is disabled, with
  the reason in words, without a connection and while changes wait to be sent.
- **End state.** Afterwards the cart is empty and the page says so once until it is closed: a plain line with the
  number of entries finished, or, when nothing is left to buy and the couple has shared achievements on, the shared
  moment (`m5s3.collection.endState`) with who put how much into the cart. The server confirms the moment through the
  existing achievement header; the client never decides it.
- **Suggestions stay.** The finished titles are the chips of the next trip, as the last two images show.

## Departures from the approved reference

- The reference shows the end state as a full composition; this step reuses the existing shared-achievement
  component and a plain line, with the cart bar gone because the cart is empty.
- No glide of the entries out of the cart, and no per-person portraits in the moment (see C2).

## Not covered

- Dark for the suggestions and the cart sheet, 360/430 px, large text, reduced motion, an Expanded capture of the finish
  action, a native device check (the Pixel).
