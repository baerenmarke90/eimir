# November 4 device-review acceptance

## Baseline and scope

Inspected main: `52d2eed`. The three Product Owner device screenshots and current
StoryProductPage, MemoryCreatePage, HeartMomentProductPage, CommentsPanel,
SharedPhotosPage, native upload adapter, notification and recap implementations
were inspected before this preflight. This record owns the complete requested
scope; checks below describe observed acceptance, not planned completion.

![Generated whole-screen composition reference](reference.webp)

The generated reference was produced before UI implementation. Its photo content
is illustrative. Existing navigation, tokens, privacy and domain contracts remain
authoritative; this image does not authorize invented fields or capabilities.

## Acceptance checklist

1. [ ] Notification onboarding enables Small Invitations after explicit consent;
   Later/denial does not. The existing independent off switch remains effective.
2. [ ] System IANA time zone replaces manual normal-user clock/zone settings and
   updates scheduling on foreground/resume without shifting authored calendar dates.
3. [ ] Shared Happiness/Time Travel invitations expire and disappear after opening
   the current contribution; later partner contributions can appear again.
4. [ ] Existing authorized Wishes and Plans can be linked from a Memory, with
   canonical destinations, explicit save/failure state and typed relations.
5. [ ] Monthly invitations expire/are consumed and show their actual period;
   previous-month material is never labelled as current-month material.
6. [ ] Discover mixes wide and narrow photo/text cards without vacant half rows,
   preserves source/focus order, and remains usable at large text/narrow widths.
7. [ ] Own-comment overflow does not move author, timestamp or row alignment.
8. [ ] Video upload transfers actual bytes, reports actual progress/processing,
   cancels safely and exits stalled transfers with an actionable retained retry.
9. [ ] Places sort alphabetically across pages and selection surfaces, with
   active/archived/all scopes and encrypted names preserved.
10. [ ] Memories has no manual Renew Discovery button; safe rotation remains.
11. [ ] Dates use the same native field interaction throughout. Range end says
    “Bis”, uses regular weight and no redundant arrow/Change action.
12. [ ] HeartMoment feeling follows Place and precedes the shared tag editor.
13. [ ] New-Plan labels omit parenthesized optional markers.
14. [ ] Tags learn from authorized authored labels. The existing periodic worker
    and local inference propose labels without silently changing authored content.
15. [ ] All paginated product lists load on scroll, including photo settings and
    source selection. Loaded pages and media use bounded account/Space storage,
    stop on errors/offline/end, and survive supported navigation/restart.

## Mobile Interaction Contract

Product Reference v1 R1/R2/R3/R5 and Screen Templates 4/7/8/9/11 apply. People,
photographs and authored words lead. The existing shell, contextual tabs,
ShortTaskSheet, focused capture, native date input and semantic tokens are reused.
There is one dominant completion action. Optional enrichment stays progressively
disclosed; tag suggestions reduce typing and do not open the keyboard by default.
No administrative table/list is introduced for relationship content.

Compact keeps reachable controls and gap-free editorial composition. Expanded
uses meaningful media width and the same task hierarchy. At 320/360/390/430 px
and 200% text, dates/metadata/labels wrap without hiding controls. Non-blocking
existing reveal/feedback motion respects reduced motion. Utility and consent
remain calm; no new decorative delight or pressure copy is appropriate here.

Loading retains safe content. Empty differs from failure. Errors retain drafts
and explain retry. Offline reads use only authorized stored shared data; offline
writes remain unsaved. Confirmed creation precedes relation enrichment, so a
failed link cannot duplicate a saved Memory. Return retains scope/loaded range.
Private HeartMoment material never enters another member's suggestions, derived
data, shared composition or cache. Relationship and account transitions revoke
late completions.

## Reuse review

Reuse Intl/system time-zone detection, native date inputs, IntersectionObserver,
TanStack infinite queries, existing product/media stores, typed Content Relations,
notification preferences, PostgreSQL job registry and local structured inference.
Do not add a second cache, transport, scheduler, provider or form lifecycle. Pure
composition and authored-label ranking are small domain logic, not a new service.
Current primary platform documentation is checked for changed commodity behavior.

## Business/freemium review

Capture, authored labels, relations, sorting, notification settings and retained
media remain Free/Core in Cloud and Self-Hosted. New video upload retains
`media.video_upload`; operator processing availability remains separate. Learned
labels are ordinary capture assistance. Optional periodic local inference uses
bounded existing operator resources and the existing AI availability boundary;
no paid history restriction or external data processor is introduced. Existing
deletion, export, privacy, storage-quota and downgrade contracts remain binding.

## Cross-cutting review and validation

Preserve tenant/author authorization, source privacy, If-Match, cancellation,
unknown-write reconciliation and account/Space resource ownership. Bound query,
storage, inference input/output and job growth. No sensitive diagnostics or
automatic authored-content rewrites. All copy uses i18n and actual local dates.

Applicable workflows/classifiers and PR metadata gates were inspected before
implementation. Run relevant lower-level tests, typecheck, lint and build before
push; then selected complete browser journeys and backend integration checks.
Collect independent failures and fix related causes together; no speculative
reruns or weakened assertions. Record exact-source visual and behavioral evidence
here before final review. Merge and publication require separate authorization.

## Execution evidence

Owning work record: [#1634](https://github.com/baerenmarke90/eimir/issues/1634).
Implementation and execution evidence are pending.
