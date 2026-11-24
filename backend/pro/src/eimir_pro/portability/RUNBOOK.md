# Operator runbook: export and import of one Space

Decision: [0020](../../../../../docs/decisions/0020-remove-transfer-bundle-self-service.md).
This tool replaces the self-service Transfer Bundle. It is run by the operator, on request of the
couple (access or portability request) or to move one Space between instances. There is no API,
no screen and no job behind it.

## What it does

- **export** writes the data of one Space, as one member sees it, to a ZIP file on disk.
- **import** adds the content of such a file to an existing Space. It is idempotent: records and
  media the Space already has are skipped, so running the same file twice adds nothing.

It runs with the environment of the API (`EIMIR_DATABASE_URL`, the media store settings and the
encryption keys), one database and one media store per run.

## Before you start

1. **Schema guard.** The tool refuses to run unless the database is at the Alembic revision it
   was verified against (`TESTED_ALEMBIC_REVISION` in `schema_guard.py`). The message names both
   revisions. Do not work around it: migrate the database, or use the tool version that matches.
   Whoever adds a Core migration re-verifies the tool and moves that revision (a unit test fails
   until then).
2. **Both people must exist in the target, before you import.** Import needs the target Space to
   exist and both partners to be active members (register and connect them first). This order
   matters for the garden: see [The garden](#the-garden).
3. **Mapping.** Source members are matched to target members by verified email, then by
   elimination (the importing member plus the one remaining partner). When that does not decide,
   name the pairs yourself with `--map SOURCE=TARGET` (account identifiers). `--member` is the
   target account that corresponds to the member who ran the export.

## Export

```powershell
python -m eimir_pro.portability export --space <space-id> --member <account-id> `
  --scope shared --output D:\handover\space.zip --max-bundle-size 2GiB
```

- `--scope shared` is the content both partners see. `--scope personal` adds the private data of
  `--member` (private notes, gift ideas, private lists, personal settings). Never hand a
  personal file to the other partner.
- A personal export also carries the member's **own support reports and the reply each one
  received** (`personalSupportReports` in `accounts.json`, #2245), so an access or portability
  request (Art. 15, 20 GDPR) is served completely. Reports belong to the account, not to the
  Space, so they are selected by `--member` alone: only that account's reports, never the
  partner's, and never in a shared export. The operator's ticket link
  (`support_report_tickets`) is not personal content and is never written. They are
  **export-only**: the import ignores them. A person who is in no Space cannot be exported (the
  tool needs a Space and a member), so serve that request from the database directly.
- The file is **plaintext**. It contains the couple's private content in readable form. It is
  created readable by its owner only (on POSIX systems), written under a `.part` name and renamed
  when complete and validated. An existing file is never overwritten.
- It prints names and counts only: file, scope, bytes, entries, media count and record counts.

## Import

Validate first. A dry run reads and fully checks the file and prints what would be added, and
writes nothing:

```powershell
python -m eimir_pro.portability import --space <target-space-id> --member <target-account-id> `
  --input D:\handover\space.zip --dry-run
```

Then run it again without `--dry-run`. Add `--map <source-account>=<target-account>` for each
member the emails do not decide.

- The file is treated as hostile input: paths, sizes, compression ratios, checksums, scope,
  relations and every photo and PDF are checked before anything is written. Imported **audio and
  video are not trusted**: they enter `VALIDATING` and run through the same worker job as an
  upload, so the worker and (for video) the Pro video processor must be running.
- The import runs in one transaction. If it fails, nothing is added and written media objects are
  removed again.
- **No quota, no Pro check.** The operator import does not check the Cloud storage quota or the
  Pro video capability. The operator is responsible for the room the import takes.

## Limits

The resource limits are parameters, applied while writing and again while reading the same file:
`--max-bundle-size` (default 4 GiB), `--max-unpacked-size` (8 GiB), `--max-entry-size` (512 MiB),
`--max-entries` (16384), `--max-json-size` (64 MiB), `--max-compression-ratio` (100). Sizes take
`KiB`, `MiB` or `GiB`. An export over a limit stops with `TRANSFER_TOO_LARGE` and leaves no file.
Disk use is the file size plus a second read for the check; memory use is bounded by the table
documents, not by the media.

## What is not in the file

Accounts and credentials, sessions, entitlements, notifications, jobs, games, one-time messages,
location sharing, calendar sync and photo sources (only a marker) are **set up again in the
target**. The garden is in the file (next section). The complete, enforced list is
`allowlist.py`; `test_allowlist_guard.py` fails when a Core table is in neither list.

## The garden

The shared garden travels as `garden.json`: the garden name, every seed and plant with its
waterings, how far each partner has seen it grow, the visitors' names and the bouquets. The rows
hold only closed codes, dates and the two partners' accounts, never a location or a text. It is
the same in a shared and a personal export. Games are not part of it.

- **No Pro entitlement is needed to import it.** The tool only stores the rows. In a target
  Space without the Pro capability they stay stored and appear when Pro is active there, as for
  any Pro data.
- **Order of operations: connect both partners in the target first, then import.** The garden
  tables are purged whenever a partner joins or a membership ends. A garden imported before both
  partners are connected is deleted by the next join. The import cannot start before both
  members exist anyway (see "Mapping" above), so do not end or re-add a member after it.
- **Only into an empty garden.** The daily seed and the bed slot are unique per Space, so the
  tool adds the garden only when the target Space has none of the six garden tables filled. A
  second run of the same file, or a file exported from the target itself, therefore adds no
  garden. This is deliberate: there is no merge.
- **Only for a pair.** Both people of the bundle must be mapped to distinct members of the
  target Space; the garden is never created for one person.
- **Hostile files** are refused before anything is written: unknown species, words, visitor,
  stage or slot, a seed that already grew, a lily outside the pond, a duplicate daily seed or
  bed slot, a watering of a missing plant, malformed bouquet arrays, accounts that are not
  members of the bundle, and rows of another Space.
- **What the tool prints.** An import and a dry run print `garden=included` when the garden is
  (or would be) added, or `garden=skipped: <reason>` (target already has a garden, the pair is
  not complete, or the database has no garden tables). Nothing is printed when the bundle
  carries no garden. The rest of the bundle is imported either way.
- **An export without `garden.json`** means the Space had no garden, or its garden referred to
  someone who is no longer an active member; a partial garden is never written.

## Handling the file

1. Work on an encrypted disk, outside any synced or backed-up folder.
2. Hand it over by a channel the couple agrees to; never by plain email.
3. Delete it afterwards (secure deletion where the filesystem supports it) and note the deletion.
4. Never attach it to an issue, a chat or a ticket.

## Troubleshooting

| Message | Meaning |
| --- | --- |
| `Refused: ... verified against revision ...` | Schema guard. Migrate or use the matching tool version. |
| `Refused: The bundle was exported at schema revision ...` | The file comes from another schema. Use the tool version that made it. |
| `Failed: TRANSFER_TOO_LARGE` | A limit was hit. Raise the named limit deliberately, or split the content. |
| `Failed: TRANSFER_MEMBER_MAPPING_REQUIRED` / `..._INVALID` | Name the pairs with `--map`. |
| `garden=skipped: ...` | The garden was not added; the reason is named. The rest was imported. |
| `Failed: TRANSFER_RELATION_INVALID` on a garden | The file's garden breaks a rule above. Do not use the file. |
| `Failed: TRANSFER_CHECKSUM_MISMATCH` / `TRANSFER_ARCHIVE_UNSAFE` | The file is damaged or hostile. Do not use it. |
