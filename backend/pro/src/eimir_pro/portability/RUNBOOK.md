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
2. **Both people must exist in the target.** Import needs the target Space to exist and both
   partners to be active members (register and connect them first).
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
target**. The garden follows in a later slice. The complete, enforced list is
`allowlist.py`; `test_allowlist_guard.py` fails when a Core table is in neither list.

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
| `Failed: TRANSFER_CHECKSUM_MISMATCH` / `TRANSFER_ARCHIVE_UNSAFE` | The file is damaged or hostile. Do not use it. |
