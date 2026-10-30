# Monthly recap discovery and playback preflight

Owner: [#1542](https://github.com/baerenmarke90/eimir/issues/1542).
Baseline: main `51fad502a8c89656365bbe8b327e0f54456fd6df`.

![Generated whole-screen reference](preflight.png)

Generated with the built-in Imagegen tool after reviewing the current Today and
recap reader screenshots and their runtime components. The exact input is in
[prompt.txt](prompt.txt). Synthetic example names and reference photography are
composition guidance, never production fallbacks. Preserve the existing shared
focal moment; the recap belongs to the monthly-highlights responsibility rather
than replacing Euer Moment as the generated composition might suggest.

## Intended product contract

The existing monthly-highlights section owns a quiet Passport continuation and,
at month end, a photo/text-led Watch now invitation for a ready nonempty edition.
An early-next-month invitation may continue into the last completed month.
Use exact server period labels; never present a partial month as completed.
Personal module visibility and order remain authoritative. No permanent extra
widget, autoplay on Wir, or inference caused by a GET is introduced.

Reuse the authorized recap overview and existing source media/task-return
contracts. Failed optional discovery must not block Wir. A removed source or
authoritative denial must not leave its previous preview visible.

Watch now deliberately starts the finite slideshow. Opening the ordinary library
remains a reading task. Playback provides visible Pause/Play and Previous/Next,
text-sensitive dwell time, a segmented progress indicator and a final reflection
page where playback stops. Preserve selection, reflection, save and original
source actions. Original authored text remains separate from generated prose.

Backgrounding, source visits, selection/reflection/save tasks and content
interaction pause playback. Returning restores the same edition and page,
paused. Autoplay must not navigate away from an actively focused content control.
Reduced motion starts paused; manual playback can advance static pages without
photo movement. No swipe-only controls or touch interception of the app shell.
Use existing semantic motion/spacing/type/surface roles and useMediaQuery.

Compact 360/390/430 px leads; Expanded preserves reading measure. Verify Light,
Dark, large text, reduced motion, sparse/no-photo, unavailable-source, pending,
offline and permission-denied states. Neither a screenshot nor mocked inference
establishes actual operator-host model quality or latency.

## Current delivery state

Only the local model prompt/evidence/editorial validation is implemented locally.
UI implementation has not started. The required public issue-linked visual
preflight push was rejected by automatic approval review. The verified remote is
the requested `baerenmarke90/eimir` repository; an explicit publication approval
is still required before that blocked action is attempted again.
