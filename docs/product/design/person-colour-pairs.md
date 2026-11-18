# Person colour pairs (Product Owner decision 2026-11-16)

Supersedes the creator-based A/B rule of #1808 and the provisional author rule of the diary branch.

## Decision

- Every person may choose **one fixed colour pair for their own view** in Settings > Appearance (a sheet like the Wir design): their own colour first, then the colour of their partner. The partner chooses their own pair. The choice is personal, **never shared** and **carries no statement about gender**; no gender is asked or stored.
- The pairs are offered as a closed list, so two people can never end up with the same colour: rose + blue, blue + rose, rose + deep rose, deep rose + rose, blue + deep blue, deep blue + blue, moss green + rose, moss green + blue.
- Choosing a pair is a **Pro feature** (capability `theme.bespoke_packs`, like the Wir designs and the app icon); **Automatic** is always free, a saved pair stays after Pro ends, and returning to Automatic is free.
- Without a choice (**automatic**) a person sees themself blue and their partner rose, which is also how the Wir stage coloured people before.
- The colour applies everywhere a person is coloured: shared-list markers, summary bars and flights, the Wir stage rings and heart line, daily insights, avatar-adjacent markers. A person is identified by role (you / your partner), not by account, so the same item may look different on the two phones.
- Colour never carries the meaning alone: every marker sits next to the name or initials, and every pair row in the settings names both colours in words.

## Implementation map

| Concern | Where |
|---|---|
| Colour values (Light and Dark), default pair | `design/tokens.json` `identity.personColors`, generated into `web/src/design/person-colors.css` by `npm run tokens:generate` (never edited by hand) |
| Variables | `--color-person-<tone>` and `-surface`; role aliases `--person-own-*` / `--person-partner-*`; classes `.person-role-own` / `.person-role-partner` set `--person-accent` / `--person-surface` |
| Roles, pairs, resolver | `web/src/client/personColours.ts` |
| Provider, read and save, root variables | `web/src/client/personColoursContext.tsx`, remembered locally by `personColoursStore.ts` (cleared on sign-out) |
| Settings question | `web/src/components/PersonColoursSettings.tsx` (summary, choice sheet with explicit save and the Pro paywall button) and `PersonColourChoice.tsx`, shown in Settings > Appearance next to the Wir design |
| API | `GET` / `PATCH /api/v1/spaces/{spaceId}/appearance/person-colours` (own value only, `If-Match`), column `app_icon_preferences.person_colours`, migration `0142` |
| Export / deletion | personal export `personalAppearance.personColours` (only when chosen); the row is removed with the account |
| Contrast | `web/src/personColorContrast.test.ts` re-checks the token values |

## Palette and contrast

Rose and blue are the existing identity colours; deep variants and moss green are new. Initials are rendered in `--color-text` on the surface colour.

| Tone | Light accent / surface | Dark accent / surface |
|---|---|---|
| rose | `#AA4C86` / `#F9EAF4` | `#F1B3D7` / `#46394F` |
| deep rose | `#6B1A4B` / `#E9A9CC` | `#D14F97` / `#A8457A` |
| blue | `#5685D1` / `#D6E1F7` | `#AED1FA` / `#303F62` |
| deep blue | `#1B3C80` / `#92AEE6` | `#4F8DEB` / `#2C5AA8` |
| moss | `#6F7D1F` / `#EEF1D2` | `#C5D36A` / `#414726` |

All initials contrast at least 4.5:1 and all accents at least 3:1 on the surface and page of both themes. Pairs of the same family differ by at least 18 in OKLab distance (x100), also under simulated protan, deutan and tritan vision. The weakest value is rose against blue in Dark for deutan vision (about 5), which the names and initials cover. Moss green was chosen after teal, slate, amber and gold collided with rose or blue under colour-vision simulation.

## Business and freemium model

Business/freemium impact reviewed. Product Owner decision 2026-11-16: choosing a colour pair is a **Pro** selection of the Bespoke Themes, Covers and UI Personalization row (`theme.bespoke_packs`); Automatic (blue for yourself, rose for the partner) stays Free/Core. The backend authorizes every save of a pair with that capability after the membership check; reads and clearing to Automatic never need it. A saved pair stays readable and effective after expiry (no data loss, no downgrade step); a new choice after expiry is blocked with `PREMIUM_ENTITLEMENT_REQUIRED`. Identical in Self-Hosted and Cloud, no managed resource. The matrix row names it.

## Privacy

Optional, personal, never visible to the partner, no gender statement, part of the personal export, removed on account deletion, never used for analytics. See `docs/PRIVACY-MODEL.md` and the privacy policy data list (the policy text still needs legal review before publication).
