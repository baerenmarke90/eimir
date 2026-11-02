# Hetzner Object Storage — Cloud provider preflight

**Owner:** [#1595](https://github.com/baerenmarke90/eimir/issues/1595)  
**Scope:** eimir. Cloud/Managed infrastructure, not the Self-Hosted default  
**Status:** candidate and operator preflight; **not** a live-provider acceptance or production cutover

This runbook specializes the existing [Cloud/Managed topology](./CLOUD-MANAGED-TOPOLOGY.md) §3.3 for a possible Hetzner Object Storage deployment. It does not select a provider in Domain code, add a MediaStore adapter, enforce a commercial quota, or change the shipped `EIMIR_MEDIA_STORE=local` default.

## 1. Existing application contract

The application already has a provider-neutral `MediaStore` interface and `S3MediaStore` adapter. `EIMIR_MEDIA_STORE=s3` selects it for the API and worker without coupling attachment ownership, authorization, deletion, or content validation to Hetzner.

Cloud Production requires `EIMIR_ENCRYPTION_AT_REST=required`. Its `EncryptingMediaStore` deliberately **does not issue presigned plaintext upload/read URLs**: client bytes pass through the authorized application path and reach S3 encrypted. Do not disable application encryption to obtain direct-to-S3 performance or adopt a public bucket.

The existing S3 adapter constructs **path-style** SigV4 URLs, `https://<endpoint>/<bucket>/<key>`; Hetzner documentation often demonstrates **virtual-hosted-style** URLs for presigned access. Actual compatibility of the current implementation (including signatures, conditional PUT semantics and errors) needs a staging integration test, not an assumption from S3 API compatibility. Do not create a second provider-specific client; make a small optional addressing-mode improvement to the existing adapter if testing demonstrates a need.

The present S3 adapter buffers a full object on PUT and GET. Even though the encryption wrapper itself is chunked, this adapter behavior affects RAM and request concurrency. Do not declare video-heavy or large-media Cloud operation production-ready until memory is bounded or load-tested against explicit constraints. See [#88](https://github.com/baerenmarke90/eimir/issues/88) and [#1595](https://github.com/baerenmarke90/eimir/issues/1595).

## 2. Provider, region, costs, and data residency

Hetzner provides regional S3 endpoints:

| Location | `EIMIR_S3_REGION` | `EIMIR_S3_ENDPOINT` |
|---|---|---|
| Falkenstein | `fsn1` | `https://fsn1.your-objectstorage.com` |
| Nuremberg | `nbg1` | `https://nbg1.your-objectstorage.com` |
| Helsinki | `hel1` | `https://hel1.your-objectstorage.com` |

Choose the region deliberately, preferably near Cloud compute and PostgreSQL. These are **endpoint examples**; the bucket name and credentials are supplied by the operator. Hetzner buckets can be provisioned in any listed EU location, but provider location alone is not a complete legal/contractual GDPR assessment.

The provider's documented model charges a base price while at least one bucket exists, with a base allowance of **1 TB stored and 1 TB outgoing traffic per account**, then usage-based excess storage (TB-hours) and egress. Upload ingress and basic S3 API calls are advertised as included. **Recheck official pricing and contractual terms before purchasing**; keep prices out of runtime constants. Account-level inclusions are not per-Space and not per-bucket.

Hetzner applies a **64 KB minimum billable size per object**, so numerous small thumbnails can cost more than a sum of their file lengths suggests. Versioned objects, metadata and incomplete multipart uploads can also remain billable. For planning, 1,000 Spaces using 50 GB each imply **50,000 GB (~50 TB)** of logical Space data, but this is a *maximum demand scenario*, not capacity to pre-purchase. Object storage grows with measured usage; account-level billing, backups, derived variants and egress require their own headroom.

The Free **5 GB** / Premium **50 GB** per-Space quotas currently in [the feature matrix](../FREEMIUM-FEATURE-MATRIX.md) are still **hypotheses**, not current enforcement. A Space-level quota must be separately approved and implemented with concurrency-safe upload reservation and reconciliation; do not infer provider billing quantities from application quota counters.

## 3. Before activating a staging bucket

1. Use a **separate staging Hetzner project/bucket and keys**. Production, Demo and Development never share buckets, credentials, keys or prefixes. Names remain operator-controlled and must satisfy Hetzner's global bucket-name uniqueness rules.
2. Create a **private** bucket at the selected region. Check bucket and object policies for public grants even when the console calls the bucket private. Do not expose objects through public ACLs.
3. Generate an S3 key pair through the operator console and store its secret outside Git, issue comments, containers and logs. **By default Hetzner S3 keys can access every bucket in the same project**. Use explicit bucket policies and/or project separation to enforce least privilege; a newly generated key does not automatically have bucket-only scope.
4. Allow the existing adapter's required object-scoped GET, PUT, HEAD and DELETE operations. Keep bucket-administration actions away from runtime credentials where possible. Plan key rotation and validate both the old-key revocation and the new-key access.
5. Define backup/restore and deletion-retention policy **before** enabling versioning or object lock. Old versions and retained objects can survive a normal delete; any retention behavior must be compatible with eimir.'s deletion/privacy contract. A provider durability claim is not an independent backup. Store the media encryption keys separately from database and object backups.
6. Apply any bucket-policy, versioning or CORS changes ahead of the acceptance test. Hetzner documents propagation delays of up to 15 minutes for some settings. A production cloud with mandatory application encryption should not need browser-to-bucket CORS for ordinary media reads/writes.

If the provider's supported features, security model, pricing or recovery guarantees do not pass this preflight, retain `MediaStore` and select another compliant S3-compatible provider without a Domain rewrite.

## 4. Operator configuration example (staging only)

Use the existing deployment environment contract; never commit a filled-in `.env` or render secrets into an archived `docker compose config` output.

```dotenv
EIMIR_MEDIA_STORE=s3
EIMIR_S3_ENDPOINT=https://fsn1.your-objectstorage.com
EIMIR_S3_REGION=fsn1
EIMIR_S3_BUCKET=replace-with-private-staging-bucket
EIMIR_S3_ACCESS_KEY_ID=replace-with-staging-access-key
EIMIR_S3_SECRET_ACCESS_KEY=replace-with-staging-secret-key
# Omit EIMIR_S3_SESSION_TOKEN unless the provider supplies one.
```

The complete `deploy/cloud-managed.env.example` still governs production configuration, including `EIMIR_ENVIRONMENT=production`, `EIMIR_DEPLOYMENT=cloud`, `EIMIR_ENCRYPTION_AT_REST=required`, deletion journal, PostgreSQL, ingress and immutable release images. Do not copy staging credentials to Production. Do not change or infer the end-user-visible product quota by changing these S3 values.

## 5. Evidence required before production rollout

Run all checks with a disposable staging Space and private test fixtures, through the real eimir. API and selected storage backend:

- [ ] Provider handshake: signed PUT/GET/HEAD/DELETE, missing object, idempotent delete, conditional upload and relevant failure status paths; explicitly confirm path-style addressing and region signing work. Include TLS certificate validation and verify no public object can be downloaded without authorization.
- [ ] Application lifecycle: create, upload, finalize, validate, bind, thumbnail, read, unbind/delete and cleanup; test both Space-owned and Account avatar media. Preserve cross-Space access denial, retry/idempotence, retention and deletion rules.
- [ ] Encryption-required flow: verify provider-visible object data is an `EIMIRENC` envelope; ensure no presigned plaintext URLs, leaked signatures, bucket-public reads or unencrypted shortcuts. Existing encryption migration/verification tools must pass in staging.
- [ ] Failure resilience: provider timeout/5xx, missing object, partial upload, concurrent actions and worker retry; no orphaned or publicly accessible media. Existing regression suites remain required.
- [ ] Memory/performance: bound API and worker memory during concurrent uploads, downloads, thumbnail generation and representative short-video transfers before enabling high-volume media traffic. The current S3 adapter's full-object buffering is an explicit blocker until fixed or measured and accepted.
- [ ] Recovery: restore PostgreSQL, provider media and separately protected encryption keys to an isolated environment, reconcile attachment references and honor the deletion journal. Never treat a backup checkbox as a successful restore drill.
- [ ] Operations and billing: capture storage usage, minimum-size overhead, variants, incomplete multipart uploads, stale versions, ingress/egress and provider invoice totals; set budget/usage alerts without exposing user content or private media keys.

**Go/no-go:** The selected provider is only live-ready after a documented staging acceptance, repeatable restore, cost envelope, quota product decision and applicable G5/security gates. Until then the existing `local` configuration stays unchanged.

## 6. Provider references

- [Hetzner Object Storage overview](https://docs.hetzner.com/storage/object-storage/overview/)
- [Using S3-compatible CLI tools](https://docs.hetzner.com/storage/object-storage/getting-started/using-s3-api-tools/)
- [Supported S3 actions](https://docs.hetzner.com/storage/object-storage/supported-actions/)
- [S3 credentials and per-key restrictions](https://docs.hetzner.com/storage/object-storage/faq/s3-credentials/)
- [Buckets and objects, including versioning and bucket policies](https://docs.hetzner.com/storage/object-storage/faq/buckets-objects/)
- [Hetzner pricing and billing](https://www.hetzner.com/storage/object-storage/)
