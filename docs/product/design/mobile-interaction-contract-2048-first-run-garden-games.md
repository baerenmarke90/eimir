# Mobile Interaction Contract: first-run Wir, full-screen garden, couple games at a distance (#2048)

Owner: [#2048](https://github.com/baerenmarke90/eimir/issues/2048).
Contract section: [Partner-App Experience Standard section 10](../../PARTNER-APP-EXPERIENCE-STANDARD.md).
Visual reference: [references/wir-start-garden-remote-games](references/wir-start-garden-remote-games/README.md).
Baseline: `main` `8d0f067a7` plus PR #2044 `cd3137b6c`. Statements describe the implementation
on the PR branch; known differences from the generated reference are listed under
[Deviations](#deviations-from-the-reference).

## Scope

1. First-run Wir for a brand-new, empty Space (`TodayPage.tsx`, `CouplePresence.tsx`,
   `PartnerAvatarPair.tsx`).
2. The garden in full screen (`GardenFullscreen.tsx`, `client/landscapeView.ts`,
   Android `ScreenOrientationPlugin.java`).
3. Moonbow at night and the device clock on the Wir garden module (`GardenAmbience.tsx`,
   `WirGardenModule.tsx`).
4. Play mode choice and play at a distance for Who of us, Wish detective and Our moments
   (`PlayModeChoice.tsx` and the three game pages).
5. Naming the result when it is kept: picture ping-pong and heart hunt.
6. Camera capture in one-time messages (`OnceMessages.tsx`, Android `PhotoFileChooser.java`,
   `PhotoCapture.java`).

## Contract items

### 1. User goal / human outcome

Arrive in a calm, personal place on the first sign-in; look at the garden as a whole picture;
play the couple games while apart; give a shared picture or a found photo its own name; send a
fleeting photo straight from the camera.

### 2. Relationship / emotional value

The empty partner place reads as "your person" and invites instead of showing a grey plus. The
games stop requiring both people in one room. Names make kept pictures personal. Nothing adds
streaks, scores pressure or timers.

### 3. Primary Compact screen/state

- First-run Wir alone: Verbunden hero with the own portrait and a dashed partner place
  (person-plus glyph, localized "your person" line), then "Welcome, {name}.", one sentence,
  the empty wall and the filled "capture your first moment" action, then the quiet invitation
  link. No daily-quote Pro teaser while the Space is empty.
- Garden: the round full-screen button on the top end of the garden frame; full screen is a
  modal sheet that fills the viewport.
- Games: after participants load, the mode choice (two radio cards and one start button)
  before a game starts.

### 4. Single dominant action

- First-run Wir: "capture your first moment" (filled, per the Button contract). The invitation
  is reachable from the partner place in the hero and from the quiet link.
- Garden full screen: none; the scene is the content. Close is the only control.
- Mode choice: "Start the game".
- Naming: the existing save button; the name field is required and prefilled.

### 5. Content hierarchy

Person/meaning → one sentence → action → quiet secondary link (first-run Wir). Scene only, with
a small title chip (garden full screen). Question → answer targets → partner progress (games).

### 6. Thumb reach and touch targets

All new controls are at least 44 CSS px (full-screen button 2.75 rem, mode cards
`--touch-target-web`, suggestion chips 2.75 rem). The close button of the full-screen sheet sits
in the top start corner, inside the safe area.

### 7. Compact and Expanded

The first-run composition keeps its hierarchy and centres on Expanded (existing
`new-space-experience` rules). The full-screen garden fills the window on every size; only
Android and browsers that allow it rotate to landscape, otherwise an upright phone shows a
short "turn your phone" line that disappears in landscape.

### 8. States

- Loading, error and offline states of the garden and the games are unchanged.
- Wish detective: the sparse state names who still needs a wish ("you", the partner by name or
  both) without counts; one wish per person is enough.
- Naming: an empty name shows an inline message (`aria-invalid`, described by the message) and
  saves nothing; a failed save keeps the typed name.
- Camera: a cancelled capture changes nothing.

### 9. Motion and reduced motion

The full-screen sheet uses the shared sheet motion. The pan hint fades in once and leaves after
the first swipe or four seconds; with reduced motion it appears without animation. The moonbow
uses the existing rainbow animation with a lower target opacity. No new looping motion.

### 10. Accessibility

The full-screen sheet is a named modal dialog (garden title) with focus restore to its button.
The scene's label names a double moonbow at night. The mode choice is a fieldset with a legend
and native radios. The naming field has a persistent label; suggestions are a fieldset of
pressed-state buttons. The waiting partner place keeps its accessible name ("invite your
partner"); its glyph is hidden from assistive technology.

### 11. Privacy

A camera photo for a one-time message is written to a private cache folder (not indexed by
the media store) that is cleared on a fresh app start and before the next capture. No notice
for the remote games contains answers, clues, guesses, wish titles or photos.

## Deviations from the reference

- First-run Wir alone: the reference shows the invitation as the filled primary action and the
  first moment as a soft action. The Button contract keeps create entry points filled and the
  page has one primary action, so the first moment stays filled and the invitation lives in the
  partner place and the quiet link.
- One-time messages: the reference shows a media sheet; the composer keeps its existing row of
  media actions and adds "take a photo" first (only where a camera answers the `capture` hint).
