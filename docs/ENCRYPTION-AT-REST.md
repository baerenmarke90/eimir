# Application-controlled encryption at rest

Decision record, security architecture, threat model, and operator runbook for
[#797](https://github.com/baerenmarke90/eimir/issues/797).

**This is not end-to-end encryption.** The running application holds the keys and
can read every value it protects. See [Security claims](#11-security-claims) for
what may and may not be said.

## 1. Vocabulary

These four things are different and must never be conflated in code, docs, or
product copy.

| Term | What it protects | Who holds the keys | Status |
|---|---|---|---|
| TLS / encryption in transit | bytes between two endpoints | the endpoints | existing (`docs/SECURITY.md`) |
| Encryption at rest (provider/volume/TDE) | disks and snapshots | the infrastructure provider | provider-dependent; **not relied upon** |
| **Application-controlled encryption at rest** | database payloads and stored media | **the eimir. operator, outside the database and object store** | **this document** |
| End-to-end encryption | content from the server itself | only the two partners | **not implemented** |

## 2. Decision

1. Sensitive `ProtectedPayload` columns are stored as authenticated ciphertext,
   sealed by the application at the SQLAlchemy persistence boundary
   (`ProtectedPayloadJSON`). Domain code never handles ciphertext.
2. Every media object (originals, thumbnails, transfer artifacts) is stored as
   authenticated ciphertext by an `EncryptingMediaStore` decorator around any
   `MediaStore`. The provider never sees plaintext, whatever it offers itself.
3. Keys form a hierarchy: an operator-supplied **key-encryption key (KEK)** wraps a
   random **data key (DEK) per record or per object**. There is no global DEK.
4. Cloud Production requires this (`required`, no opt-out). Self-Hosted must choose
   explicitly; there is no silent plaintext default in Production.
5. Search over encrypted content runs in the application after decryption, not in
   PostgreSQL (section 7).

### Alternatives considered (reuse before build)

| Option | Verdict |
|---|---|
| Provider SSE (S3 SSE-S3/SSE-KMS), volume encryption, PostgreSQL TDE | Rejected as the *sole* guarantee: optional, provider-specific, and invisible to an application that cannot verify it. Still recommended as defence in depth. |
| `pgcrypto` / database-side encryption | Rejected: the key would be sent to, and logged by, the database, defeating the separation between data and key. |
| Client-side / end-to-end encryption | Out of scope by the issue (non-goal). It changes product features (server search, reminders, recaps) and needs an audited key-exchange design. |
| Google Tink streaming AEAD, age, libsodium secretstream | Considered for the media format. Each would add a dependency and its own key/keyset format for a construction that is small when built from one audited primitive. |
| **`cryptography` (AES-256-GCM) with a per-record/object DEK wrapped by a versioned KEK** | **Selected.** `cryptography` is already a transitive dependency (via `pyjwt[crypto]`) and is now declared directly. No cryptographic primitive is implemented in this repository; only key-wrapping and chunk framing are composed. |
| Managed KMS/HSM | Kept possible: consumers depend on the two-method `KeyWrapper` contract (`wrap`/`unwrap`). A KMS adapter implements it without touching the payload or media formats. Not built now because it adds a provider dependency the issue does not select. |

License/ToS: `cryptography` is Apache-2.0/BSD dual-licensed. Cloud and Self-Hosted
behave identically. No data leaves the deployment.

## 3. Key hierarchy and formats

```text
KEK (operator secret store, id e.g. "2026-09")   never in the repo, image, DB or bucket
  |  AES-256-GCM wrap, AAD = domain | key id | object context
  v
DEK (random 256-bit, one per record / per object)
  |  AES-256-GCM
  v
protected payload JSON      /      media object body (64 KiB chunks)
```

### Database payloads

Stored in the existing JSONB `payload` column, no schema change:

```json
{"_enc": 2, "kid": "2026-09", "wk": "<wrapped DEK>", "n": "<nonce>", "ct": "<ciphertext+tag>"}
```

- `_enc` is the scheme number and always equals the row's `crypto_version` column.
  `0` = legacy plaintext, `2` = this scheme, `1` stays reserved for client-side
  sealing that does not exist.
- A fresh DEK and nonce are generated on every write, so a nonce is never reused
  under a key and identical content never produces identical ciphertext.
- AAD binds the payload type (`ProtectedPayload.crypto_context()`, the class name
  by default). A ciphertext moved into a column of another payload type fails
  authentication. **Renaming a payload class changes its context**; override
  `crypto_context` to pin the old label. `test_payload_encryption.py` pins every
  registered label.
- **Not bound: row identity.** A party able to write to the database can swap two
  ciphertexts of the same payload type between rows. The column type cannot see its
  row. Binding rows is a documented follow-up (section 12).

### Media objects

```text
"EIMIRENC" | fmt | chunk_size | key id | wrapped DEK | chunk_0 ... chunk_n
```

- The wrapped DEK is bound to the storage key, so an object copied to another key
  does not decrypt. Adoption/relocation therefore re-encrypts (`MediaStore.copy`).
- Chunks are AES-GCM with the chunk index as nonce and a final-chunk flag, so
  reordering, truncation, and appended data all fail authentication.
- Key metadata lives inside the object. Deleting the object deletes its wrapped
  key; there is no separate key table to keep in step with the deletion lifecycle.
- The provider sees an opaque blob typed `application/octet-stream`.
- Memory: encryption and decryption hold one chunk plus one lookahead chunk. The
  S3 adapter still buffers a whole object per request (an existing property of its
  SigV4 body hashing), so large objects are bounded by the wrapped adapter, not by
  the encryption layer. The local adapter streams.

## 4. Modes, environments, and deployments

`EIMIR_ENCRYPTION_AT_REST`:

| Mode | Writes | Reads of legacy plaintext | Reads of ciphertext | Intended use |
|---|---|---|---|---|
| `required` | encrypted | **rejected (fail closed)** | decrypted | Cloud Production; Self-Hosted steady state |
| `migrating` | encrypted | accepted | decrypted | explicit cutover window for an existing installation |
| `disabled` | plaintext | accepted | **rejected** | Self-Hosted opt-out; development, test, demo default |

| Deployment | Rule (enforced by `Settings` at startup) |
|---|---|
| Cloud Production | Must be `required` with valid keys. Unset, `migrating`, `disabled`: refuse to start. |
| Self-Hosted Production | Must be **set explicitly** (unset refuses to start). `required`, `migrating`, or an explicit `disabled`. The release guard refuses an unset mode at deploy time. |
| Development / test / demo | Unset means `disabled`. Keys with no mode, or keys next to `disabled`, are refused so keys never sit beside a silently plaintext configuration. |

Additional guarantees:

- No default key exists in code. Tests generate random keys per run
  (`tests/support/encryption.py`), so there is no test key that could reach a
  production configuration.
- Keys must be 32 bytes of base64; single-repeated-byte placeholders (`AAAA...`) are
  rejected. Error messages never contain key material; `Settings` stores keys as
  `SecretStr`.
- Missing, wrong, or revoked key material fails the read or write with a fixed-text
  error. There is no plaintext fallback anywhere.
- Turning encryption `disabled` on an installation that already holds ciphertext
  does not expose plaintext: ciphertext is rejected instead of being returned.

Self-Hosted decision: encryption is available and recommended, and the installation
is not broken by an upgrade because `migrating` keeps old data readable. Operators
who rely on their own disk/volume encryption may opt out explicitly. The choice is
never made silently for them, which is the reason there is no Production default.

## 5. What is encrypted, and what deliberately is not

**Encrypted (ciphertext at rest):** the `payload` column of `attachments`,
`chapters`, `collection_items`, `collections`, `comments`, `gift_ideas`,
`heart_moments`, `important_dates`, `memories`, `milestones`, `places`, `plans`,
`private_collection_items`, `private_collections`, `private_notes`,
`profile_preferences`, `related_persons`, `reminders`, `wishes`; every media
original, thumbnail and derived variant; Transfer Bundle artifacts held in storage.

**Plaintext by design (routing, authorization, indexing):** `id`, `space_id`,
`owner_id`, `author_id`, `privacy_class`, `status`, timestamps and date columns
(`happened_on`, `experienced_on`, `start_on`, ...), `crypto_version`, version
counters, foreign keys, positions, and the plaintext `kid` inside an envelope.
Authorization, sorting, keyset pagination, and relations depend on these. Media row
metadata (`mime_type`, `size`, `width`, `height`, `has_thumbnail`) also stays plaintext
because it drives validation and rendering.

**Outside the ProtectedPayload boundary today (not covered by this change):** account
and space display names, email addresses, and `profile_preferences.topic` (a
user-authored 120-character column that sits beside its protected `value`). They are
listed as follow-ups in section 12; they were never part of the `ProtectedPayload`
contract this issue extends.

## 6. Data flows

| Flow | Behavior with encryption on |
|---|---|
| Upload | The client is given the authorized application route (`method: STREAM`). Presigned PUT URLs are **not** issued, because they would let plaintext reach the provider directly. The API encrypts while writing. |
| Validation worker | Opens the object (decrypting), validates and sanitizes, writes the sanitized original and the thumbnail back encrypted. No plaintext temporary file is created; the pipeline works on memory buffers. |
| Read | The client is given the authorized application route. Presigned GET URLs are **not** issued. The first block is authenticated before the response starts, so a wrong key or a tampered object is an error rather than a truncated `200`. |
| A presigned upload issued before the cutover | May still land as plaintext at the provider. The worker rejects it, deletes the object, and fails the attachment. |
| Transfer export | User-authorized and plaintext by definition: stored payloads are decrypted into the bundle for the requester's own authorized rows, and the bundle is held in storage encrypted until it expires. |
| Transfer import | Bundle payloads are encrypted before insert; `crypto_version` is set from the active mode regardless of what the bundle claims. |
| Adoption/relocation | Decrypt with the old key context, encrypt under the new one. |
| Deletion / offboarding | Deleting an object deletes its wrapped key with it. Existing retention, offboarding and Account-deletion flows are unchanged. |

Trade-off accepted: browser-to-provider direct transfer is gone for encrypted
deployments, so uploads traverse the API. The existing size limits bound the API's
buffering, and `LocalMediaStore` deployments already worked this way.

## 7. Search

The M4-A design used PostgreSQL full-text indexes over `payload->>'title'` and
similar. That cannot coexist with encrypted payloads: the database cannot tokenize
ciphertext, and a GIN index over the plaintext would be a searchable copy of
protected text that no column-level encryption reaches.

Revision `0069` drops the thirteen `*_search_fts` indexes. Search now authorizes in
SQL first (space, privacy class, owner) and only then decrypts and matches inside
the application. The public contract (endpoint, filters, ordering, cursor binding,
result shape, log privacy) is unchanged. Two things differ:

- Query language is a documented subset of `websearch_to_tsquery`: words are ANDed,
  `"quoted words"` must be adjacent, `-word` excludes, `or` separates alternatives.
  Tokenization is Unicode word splitting with case folding (no stemming, as before).
- Cost is linear in the caller's own authorized content per query instead of
  index-backed. That is bounded by the size of one relationship space; a
  searchable-encryption or per-space encrypted index is a follow-up if that bound is
  ever exceeded.

## 8. Migration and cutover

### Legacy plaintext database rows

Each row is converted by **one guarded `UPDATE`** that swaps the plaintext JSON for
its envelope and sets `crypto_version = 2` together, where the guard requires the
payload to still equal the value that was read:

- a crash leaves every row either wholly plaintext or wholly encrypted, never a
  mixture, and every row stays readable in `migrating` mode;
- re-running is idempotent (already-encrypted rows are not selected);
- a row an application write changed in between is skipped, not overwritten, and is
  picked up on the next run;
- the conversion is verified in memory (decrypt and compare) before it is written;
- nothing is destructive and no schema change is required.

Mixed states are observable without any key (`status`): counts per `crypto_version`,
per key id, and rows whose `crypto_version` disagrees with the payload marker.

### Legacy plaintext media

`EncryptingMediaStore.encrypt_legacy` replaces an object with the finished
ciphertext in a single atomic write (temp file plus rename for the local adapter, one
`PUT` for S3). A crash leaves either the untouched plaintext object or the complete
ciphertext object. Objects that already start with the envelope magic are skipped, so
re-running is a no-op.

### Cutover procedure

1. Generate keys (section 9), place them in the secret store, deploy with
   `EIMIR_ENCRYPTION_AT_REST=migrating`. From now on all writes are encrypted; old data
   remains readable; new upload descriptors switch to the application route.
2. Run `python -m eimir.security migrate-payloads` and `migrate-media` (same
   environment as the API). Both are resumable.
3. Run `verify-payloads` and `verify-media`. Both must report zero unreadable, and
   `status` must show no `crypto_version = 0` rows.
4. Switch to `required`. From now on plaintext found anywhere is rejected.
5. Roll a fresh database backup and object-store snapshot: **older ones contain
   plaintext** and must be retired according to the retention policy.

Rows written by an old application version during a rolling deploy are plaintext
again; re-run step 2 before step 4. `required` fails closed on them, which is the
signal.

Transfer artifacts written before the cutover are short-lived (they expire) and are
not migrated; orphaned objects with no attachment row cannot be discovered because
the `MediaStore` interface has no listing operation.

## 9. Key management and rotation

Generate a key on a trusted machine, outside the repository:

```bash
python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
```

Configuration (`Settings`):

- `EIMIR_ENCRYPTION_KEYS`: JSON object `{"<key id>": "<base64 32-byte key>", ...}`
- `EIMIR_ENCRYPTION_ACTIVE_KEY_ID`: the id new writes are wrapped with

Rules:

- Production keys differ from Development, Demo, and every other project
  (`scripts/check_environment_isolation.py` fails when a Development and a Production
  file share `EIMIR_ENCRYPTION_KEYS`).
- Keep the keys in a secret store **separate from database and object-store
  backups**. A backup and its keys must not be recoverable from the same place.
- API and worker need read access to the keys; the release-guard one-shot does not
  receive them; database and object storage never see them.
- Loss of one storage provider does not lose the keys, and the keys are independent
  of the provider.

### Rotation (planned)

1. Add a new key id to `EIMIR_ENCRYPTION_KEYS` **keeping the old ids**, set
   `EIMIR_ENCRYPTION_ACTIVE_KEY_ID` to the new id, deploy. New writes use the new key;
   old data stays readable.
2. Run `python -m eimir.security rewrap-payloads` and `rewrap-media`. They re-wrap
   DEKs only; payload and media bodies are not rewritten and no plaintext is handled.
3. Confirm with `status` that every row reports only the new key id.
4. Remove the old id from `EIMIR_ENCRYPTION_KEYS`. Anything still wrapped under it
   becomes unreadable, so do not skip step 3.

### Revocation after suspected key compromise

A compromised KEK only matters to someone who also holds ciphertext. Rotate as above,
then treat every backup that pre-dates the re-wrap as still protected by the old key:
destroy or re-encrypt those backups according to your retention policy. Rotation does
not re-encrypt bodies, so if a *data* key must be considered exposed (for example an
application host was compromised while decrypting), the affected content must be
re-written, which the application does on the next edit; a bulk re-encrypt command is a
follow-up.

## 10. Backup, restore, export, disaster recovery

- **Database dumps and object-store copies contain ciphertext as stored.** Neither
  path decrypts, so a backup taken with encryption `required` exposes no protected
  plaintext by itself. This is why compromise of a database backup alone, or of object
  storage alone, does not expose plaintext payloads or media.
- **Keys are not part of any backup produced by eimir. tooling.** The Self-Hosted
  recovery script archives the database dump and the media directory; the operator's
  protected configuration/secret backup (which already carries the deletion-authority
  UUID) must additionally carry the encryption keys, stored apart from the data
  archive. See `docs/SELF-HOSTED-RECOVERY.md`.
- **Restore** needs the data archive **and** the key set that wrapped it, including
  older key ids the data is still wrapped under. Restoring data without its keys
  yields ciphertext that fails closed. Do not remove an old key id before its re-wrap
  finished and a fresh backup exists.
- **Disaster recovery drill:** restore into a scratch environment with the recovered
  keys, run `verify-payloads` and `verify-media`, and only then declare the backup
  usable. A backup that has never been verified against its keys is not a backup.
- **User-authorized export is not a backup.** The Transfer Bundle is plaintext for the
  person who asked for their own data. It never contains other members' private
  content and never copies stored ciphertext. Support and administration paths must not
  export decrypted content; none exists.
- Backups taken *before* the cutover contain plaintext; see cutover step 5.

## 11. Security claims

Allowed: "Sensitive content is encrypted at rest by eimir. under keys held separately
from the database and object storage." "Encrypted in transit (TLS) and at rest."

**Not allowed:** end-to-end encryption, zero-knowledge, "not even we can read your
data", or anything implying the operator cannot access content. The running
application decrypts content to serve it. `docs/SECURITY.md` keeps the rule that the
claim may only be made after an actual E2EE implementation and an external audit.

## 12. Threat model and known limits

| Scenario | Outcome |
|---|---|
| Object storage read or snapshot alone | Only ciphertext and wrapped DEKs; no KEK. Plaintext not exposed. |
| Database dump or replica alone | Ciphertext payloads; the FTS indexes that held plaintext lexemes are dropped. Plaintext payloads not exposed. Plaintext metadata (section 5) is. |
| Database **and** object storage, no keys | As above; no plaintext content. |
| Attacker with database *write* access | Cannot read content. Can delete or replace rows; replacing an object with one from another key fails authentication, but swapping two rows' ciphertext of the same payload type is **not** detected (row binding is a follow-up), and rolling an object back to an older ciphertext is not detected. |
| Application host compromise | Out of scope for at-rest encryption: the application holds the KEKs and can decrypt. Least-privilege and host hardening apply. |
| Operator / support access | The operator can decrypt by design. This is why the feature must never be called E2EE. |
| Lost key | Content wrapped under it is permanently unreadable. Keep separate, protected copies. |

Known limits and follow-ups (deliberately not implemented here):

- Row identity is not part of the payload AAD (see section 3).
- No bulk re-encryption of bodies for a compromised *data* key (re-wrap covers KEK
  rotation).
- No KMS adapter (the `KeyWrapper` contract is ready for one).
- Search is an in-application scan (section 7).
- Columns outside the `ProtectedPayload` contract (`profile_preferences.topic`,
  names, emails) remain plaintext.
- The Transfer export builder spools the bundle through a temporary file once it
  exceeds 16 MiB; that is a plaintext, transient file on the worker. Point the
  worker's temporary directory at memory-backed storage (tmpfs) where that matters.
- Object listing is not part of `MediaStore`, so orphaned pre-cutover objects
  without an attachment row cannot be found and migrated.
- S3 puts and gets still buffer a whole object in memory (existing adapter
  behavior).

## 13. Failure modes

| Condition | Result |
|---|---|
| Production without mode / with `migrating` or `disabled` on Cloud | Startup refused (`Settings`); unset mode also refused by the release guard. |
| Missing, malformed, placeholder, or duplicate key material; active id not in ring | Startup refused; message names the variable, never the value. |
| Unknown key id on read | `DecryptionError` (fixed text); no plaintext, request fails. |
| Wrong key, tampered ciphertext, wrong payload type, truncated or reordered object | Authentication fails; request fails; nothing is returned. |
| Plaintext row or object in `required` | `PlaintextRejectedError`; request fails. |
| Ciphertext in `disabled` | Rejected; never returned as content. |
| Stored value no longer satisfies its payload schema | Fixed-text error; the error does not quote the decrypted value. |

One unreadable row fails the request that reads it. That is deliberate: silently
skipping content the caller is entitled to see would hide data loss.

## 14. Operational verification (production-like Cloud)

No command prints or logs content. Run with the API environment:

```bash
python -m eimir.security status            # counts per table: crypto_version, key ids, inconsistencies
python -m eimir.security verify-payloads   # authenticates and schema-validates every row; non-zero on any failure
python -m eimir.security verify-media      # authenticates every referenced object end to end
```

Raw inspection without keys (expect envelopes only, no titles, bodies, or text):

```sql
SELECT crypto_version, count(*) FROM memories GROUP BY 1;
SELECT left(payload::text, 60) FROM memories LIMIT 3;   -- {"_enc": 2, "kid": ...
SELECT count(*) FROM pg_indexes WHERE indexname LIKE '%\_search\_fts';   -- 0
```

For the bucket, fetch any object and confirm it starts with the `EIMIRENC` magic and
does not equal, nor contain, the original bytes.

## 15. Commands

| Command | Effect |
|---|---|
| `status` | Read-only counts; needs no key |
| `migrate-payloads` / `migrate-media` | Encrypt legacy plaintext; idempotent, resumable |
| `rewrap-payloads` / `rewrap-media` | Re-wrap DEKs under the active KEK |
| `verify-payloads` / `verify-media` | End-to-end authentication; non-zero on failure |

All are invoked as `python -m eimir.security <command>`.
