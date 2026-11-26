# ServerAdmin part 3: People and the Space file

**Status:** draft for Product Owner approval. **Umbrella:** #2314. **Builds on:** parts 1
and 2 (merged) and the [redesign design](2026-11-26-server-admin-redesign-design.md)
section 5.3. **Visual reference:**
`docs/product/design/references/server-admin-redesign/03-space-file-compact.png`.

## 1. Intent

When the Situation says "a Space is at 92 %" or a gift ends, the operator must see on one
page whom it concerns and act there, instead of jumping between the Accounts and Spaces
lists, which today cannot even link to each other.

## 2. Decisions already taken (Product Owner, 2026-11-26)

- The Space file may show the member accounts **where data-protection defensible**:
  primary email, verification state, sign-in methods, membership status. Not shown:
  display name, Space name/profile, relationship dates, any content.
- Basis: the published privacy policy already says the administration tools show account
  data and never content; operating service, quota and support is contract performance.
- Safeguards: allow-listed ServerAdmin only, every Space file view recorded in the
  privileged audit, no export or bulk list of the link, `docs/SERVER-ADMIN.md` updated.

## 3. Goals, non-goals

Goals
- One search field on People: an email (or part of it) or an Account/Space id finds the
  Accounts and, through their memberships, their Spaces.
- The Space file: members as above (each linking to its Account), plan and its source
  (effective entitlement and grant history, from the existing entitlement endpoint),
  storage used against the Cloud quota with the split by media type, and a short
  timeline of operator-relevant events (entitlement grants/revocations and privileged
  admin actions on this Space). Existing actions stay in place: Premium gift/revoke,
  configuration-manager reconcile.
- The Account detail lists its Spaces (membership status) linking to their Space files.
- Situation links (`?section=spaces&space=<id>`) open the Space file directly.

Non-goals
- No names, Space names, content, or report authorship anywhere on these pages; support
  reports stay anonymous and never link to a Space.
- No new write actions in this part (see section 5).

## 4. Design

- **API:** `GET /api/v1/server-admin/search?q=` returns at most 20 Accounts (email
  substring or id) and the Spaces of those Accounts plus a Space matched by id.
  `GET /api/v1/server-admin/spaces/{id}/file` returns members, storage (used, quota,
  bytes per media type), entitlement summary and timeline; each call writes a
  `space_file_viewed` privileged audit event. `ServerAdminAccountDetail` gains its
  Spaces (id, membership status, since).
- **Web:** People opens with the search field and results; selecting a Space opens the
  Space file (mockup board 3, without names); the Account detail shows its Spaces. The
  existing Accounts and Spaces lists stay reachable as sub-pages for browsing.
- **Docs:** `docs/SERVER-ADMIN.md` Space lifecycle directory contract updated (the
  narrow Account link and its audit).

## 5. Open question for the Product Owner

The mockup shows a button "Speicher zeitweise erhöhen". It would be a new per-Space quota
override: a business-model decision (Free 5 GB / Premium 50 GB per Space) with a matrix
change. Recommendation: leave it out of part 3; the existing Premium gift already lifts a
Space to 50 GB.

## 6. Left to the builder

- Search ranking and limits, timeline length, component split, empty and error states.
