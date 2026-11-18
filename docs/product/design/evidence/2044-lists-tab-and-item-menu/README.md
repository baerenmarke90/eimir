# Lists tab, item actions menu and related polish (PR #2044)

Visual and behavioral evidence for the fifth bottom-navigation destination (Lists and Notes as peer views), the one actions menu on single-item detail pages, list cards with checkable entries, the collapsible note search, slimmer tag chips, and the daily check-in hint on the Wir page. The partner map spacing is not part of this set (see "Not covered").

## How these were captured

- Local web client (Vite dev server, port 5174) served from the PR working tree (worktree HEAD `970c2fdad` when the README was written; the dev server serves the working tree, not a pushed commit), local backend with the seeded demo Space, joined as the demo persona Lea (fictional data).
- Browser pane of the desktop app with viewport emulation: 390 x 844 (Compact), 320 x 700 (narrow Compact), 1280 x 900 (Expanded).
- Light/Dark: the app theme preference was pinned through the `eimir.theme` local-storage key (`light` or `dark`), because the pane re-syncs its color-scheme emulation to the app theme. The key was removed afterwards.
- "200-text" files: the document root font size was set to 200 % (`document.documentElement.style.fontSize`). This is a browser-side approximation, not the Android system font scale.
- Image sizes differ because the pane re-scaled itself between captures: Compact images are 392 x 848 or 585 x 1266 (the latter is a 1.5x render of the 390 px layout); the 1280 px images are downscaled to 800 x 562 or 551 x 387 and are therefore low resolution.
- Navigation between pages used real clicks where practical and history navigation (`pushState` plus `popstate`) otherwise, to avoid slow full reloads of the dev server. The bottom bar highlight can lag for a moment right after such a navigation; the captured frames were taken after it settled unless stated.

## Images

Lists tab (Compact)

- `listen-lists-390-light.jpg`, `listen-lists-390-dark.jpg`: Lists tab, Lists view. Bottom bar shows five destinations with Lists active; page heading, Lists | Notes switch, status filter chips, list cards with checkbox entries (done entries struck through).
- `listen-lists-expanded-390-light.jpg`, `listen-lists-expanded-390-dark.jpg`: list card expanded through the "+ N more" control; the control turns into a "show less" control; other cards unchanged.
- `listen-lists-tick-saved-390-light.jpg`: one open entry ticked (it moved to the done position and is struck through). The network log showed a PATCH on that list item returning 200 immediately, with no extra confirmation step. The entry was unticked again afterwards to restore the demo data.
- `listen-notes-search-closed-390-dark.jpg`, `listen-notes-search-open-390-dark.jpg`: Notes view with the search collapsed to an icon, then opened (focused field above the filter chips). Tapping outside with an empty field collapsed it again.

Actions menu (Compact)

- `note-read-390-dark.jpg`: note read page; the Lists destination stays active in the bottom bar.
- `note-menu-390-light.jpg`, `note-menu-390-dark.jpg`: note menu (Edit first, Pin, Delete last in the destructive color; each row has a one-line description).
- `note-delete-confirm-390-dark.jpg`: delete confirmation sheet opened from the menu; Cancel was used, nothing was deleted.
- `wish-menu-390-light.jpg`, `wish-menu-390-dark.jpg`: wish menu (Edit, Remind, Continue wish, Delete; no descriptions).
- `wish-delete-confirm-390-light.jpg`: wish delete confirmation; Cancel was used.
- `person-menu-390-light.jpg`, `person-menu-390-dark.jpg`: person menu (Edit, Remove person).
- `memory-menu-390-light.jpg`: memory menu; only Edit is offered (the memory was authored by the partner, so no delete entry is presumably expected, not verified against the code).
- `heart-moment-menu-390-light.jpg`: heart moment menu; only Edit (the heart moment is from the partner).

Tag chips (Compact)

- `memory-detail-tags-390-light.jpg`, `memory-detail-tags-390-dark.jpg`: tinted, borderless chips on a memory detail page.
- `heart-moment-tags-390-light.jpg`, `heart-moment-tags-390-dark.jpg`: the same chips on a heart moment (rose tint).

Wir page

- `wir-hint-390-light.jpg`: the daily check-in hint pill under the own name, shown once per quiet-hint counter (the hint counter in local storage was cleared to see it; it sinks into the plus on the own ring after about 3 seconds). Only this one frame of the hint was captured; the sinking motion itself was not reviewed frame by frame.

- `wir-hint-sinking-390-dark.jpg`: Dark, a later frame of the hint: the pill is shrinking into the plus on the own ring; a faint empty pill placeholder is still visible left of the share-location link during the motion.
- `wir-settled-390-dark.jpg`: Dark, settled state after the hint: only the plus on the own ring, no leftover pill.

Large text (200 %)

- `listen-lists-390-light-200-text.jpg`, `listen-lists-390-dark-200-text.jpg`: Lists tab at 390 px, bottom bar with five labels.
- `note-read-320-light-200-text.jpg`: note page at 320 px, bottom bar.
- `note-menu-320-light-200-text.jpg`, `note-menu-320-light-200-text-scrolled.jpg`: note menu at 320 px: the sheet fills the viewport, scrolls internally, and the Delete row is reachable after scrolling.

Expanded (1280 px, Light)

- `listen-lists-1280-light.jpg`, `listen-notes-1280-light.jpg`: Lists tab, both views. Five destinations in the top navigation, no overlap, no horizontal page overflow (document width 1265 of 1280 px measured).
- `note-read-1280-light.jpg`: note read page; see the defect list below (title sits in the header row next to the menu button).
- `note-menu-1280-light.jpg`, `wish-menu-1280-light.jpg`: the menu at Expanded is a centered dialog with a close button.
- `wish-detail-1280-light.jpg`: wish detail page at 1280 px.

## Acceptance behavior exercised (open, interact, observe, return)

- Lists tab: opened from the bottom bar, switched Lists to Notes and back through the switch, observed the active state and heading.
- List card: expand, tick an entry (immediate save verified in the network log), untick it, collapse state observed.
- Notes search: open, empty blur collapses it.
- Note page: open from the overview, open the menu, open the delete confirmation, cancel, return to the page. Escape closed the sheet and a second open worked.
- Wish page and person page: open, open the menu, open the delete confirmation (wish), cancel.
- Memory and heart moment pages: open, open the menu, close.

## Not covered

- Reduced motion cannot be emulated in this setup; the sinking hint, sheet transitions and the expand animation were not checked with reduced motion.
- No real device or Android WebView check; the 200 % text is a root-font approximation, not the system font scale.
- The partner map page spacing change was not captured.
- The Wir hint was captured at 390 px only (one full-hint frame in Light, one mid-motion frame in Dark); not captured at 200 % text.
- Dark was not captured at 1280 px; the 1280 px set is Light only.
- 430 px width and sparse/dense data variants were not captured; the demo Space has one note, a handful of lists and three people.
- Actually deleting an item and the post-delete return navigation were deliberately not exercised (demo data preserved).
- Pin, Remind, Continue wish and Edit actions were not executed.
- The tag-chip contrast was judged visually only; no contrast measurement was made.

## Review findings and their status

Findings from reviewing the captures above, and what happened to them. The images show the state before these fixes unless noted.

- **Note read page at 1280 px:** the title sat in the header row next to the menu button because a shared-content heading rule forced a row layout. Fixed: item headers keep their stacked rows at every width (`SharedContentPages.css`). `note-read-1280-light.jpg` shows the old state.
- **Bottom bar at 200 % text:** labels broke inside words with five destinations. Fixed: the label size is capped with the screen width, so all five labels stay on one line at 390 px with 200 % text (measured after the fix: every label one line, bar 64 px high). `listen-lists-390-*-200-text.jpg` show the old state.
- **Menu consistency:** only the note menu carried a description under Edit and Delete, used "Delete …" with an ellipsis and a different confirmation button. Fixed: those descriptions are gone, the row reads "Löschen" and the confirmation button reads "Endgültig löschen", like the other pages. The Pin and Wir-presentation descriptions stay because they explain behaviour.
- **Wir hint:** a faint empty pill stayed visible for a moment after the line sank into the plus. Fixed: the whole pill hides while its line flies and the line is retired on landing.
- **Not changed, open:** the header type label breaks inside a word at 320 px with 200 % text ("GEMEINSAME NOTIZ"); the wish detail page is full width at 1280 px while note pages use a 720 px column (existing difference between the page types); the active Listen and Mehr icons look dim against their pill in the dark theme although the computed colour is correct (existing navigation styling, not part of this change).
- **Unconfirmed:** the wish menu once failed to reopen after a programmatic click and Escape across a viewport change; it could not be reproduced.
- **Memory and heart-moment menus offer only Edit** when the viewer is not the author, because the existing delete capability is false for them; this is intended.
