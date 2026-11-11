# Mobile gallery and overview corrections

Baseline `3f15be74bc3df6f7f376bd96a4912530cbdb7469`, reviewed on 2026-11-11.
The Product Owner requested one merge-ready PR covering the following corrections.

## Acceptance and interaction contract

- Remove the gentle invitation card from Wir. Reuse existing personal Push delivery.
- Place the labeled creation action at the trailing edge of the page heading on
  Moments, Planning, Places, Lists and People. Wrap the action to a trailing-aligned
  second row when width or enlarged text requires it. Planning follows the active
  segment. Retain the existing task, focus restoration and origin context.
- Remove the retrospective kicker and redundant open text from Moments discovery.
  Keep its photograph, title, date and linked destination, with a trailing chevron.
- Slow the explicit map camera journey from 900 to 1100 ms, retaining interruption
  and the reduced-motion outcome.
- Keep the video comment action in the media action position shared with photos.
- Show the sensitive-media hide action over the image as an accessible icon button.
- Use the existing reaction icon with its localized accessible name.
- Animate the gallery position indicator with a small launcher-like active marker.
  Keep native scrolling, touch selection, keyboard names and reduced motion.
- Start comment textareas at two lines, retain resizing and existing draft safety.

## Product and reuse review

Product Reference v1 R2, R3, R4 and R5, the Overview/Detail templates and the
page-composer contract govern. Authored content remains the focal point.
Reuse PageHeader, AddAction, MomentCreateMenu, the existing media carousel,
SensitiveMediaControl, CommentsPanel, semantic tokens and CSS transitions.
Retain native links, forms and Leaflet camera interruption. Existing React/CSS
capabilities fit this scope. No new provider or dependency is required.

The same mobile-first composition adapts to Expanded. Check Light/Dark,
360/390/430 px, 320 px enlarged text, keyboard focus and reduced motion. Existing
loading, empty, offline, failed and saved states retain their owning controls.
Sensitive reveal stays volatile and resets on backgrounding and identity changes.
Review actual capture/save/result/return and cancellation journeys.

No business/freemium impact. This changes presentation and existing entry points,
with the same Core/Premium capabilities, Space ownership, Cloud/Self-Hosted
availability, quotas and retained-data rights.

## Generated preflight

![Generated Compact composition](reference.png)

Generated with the built-in Imagegen tool before UI implementation. The prompt
specified the current navy/lavender eimir composition, labeled heading action,
existing three Moments segments and bottom navigation, linked retrospective
photo/title/date/chevron, photo-overlay eye-off/comment/reaction actions, a
launcher-like active gallery marker and a two-line comment textarea. Synthetic
Heidelberg/lake imagery supplies illustrative content. Actual typography, shell
icons, author presentation and component tokens follow the repository.

The reference guides placement. Runtime evidence and the Product Owner's
requested changes determine acceptance.
