# Comment digest Push backend: #515 bounded slice

The v2 notification catalog classifies `COMMENT_CREATED` as DIGESTIBLE. This
backend slice allows one generic Push per recipient, Space, endpoint and fixed
UTC hour **only after an explicit recipient-owned `PUSH` preference row has
been set to true**. The public preference API and Settings still reject this
choice. Existing users cannot activate it, and rollout creates no unsolicited
Push. Exposing that opt-in is a separate user-facing slice with its required
visual preflight. EMAIL digest, wider Activity kinds and a daily-summary
control remain outside this slice.

Projection time determines the UTC bucket. Each opted-in comment creates one
existing `PushDelivery` receipt and one delayed job with only a technical
delivery ID. The job cannot call the provider before the bucket closes. After
current Account, active Membership, target privacy, policy and preference
checks, the newest eligible receipt sends the existing `notification.generic`
presentation with a current authorized Notification ID. Other receipts in
the same bucket finish `DIGEST_COALESCED`. The Center retains every entry and
its independent read state. A late Outbox projection enters its actual
projection-time bucket rather than retroactively recreating a completed one.
The provider idempotency key is stable across all candidates for that
recipient/Space/endpoint/bucket and across worker retries.

The recipient's existing Quiet Hours window may defer a bucket's external
release. The current Account timezone is recalculated at each worker visit,
and existing post-window coalescing prevents a wake-up burst. A muted or
revoked target stops before the provider; if the newest candidate becomes
unavailable, suppressing a whole batch is the conservative privacy result.
No sender name, count, target title, comment text, inferred Presence or
relationship sentiment enters the job, receipt or provider payload. A single
generic push references one authorized entry; it does not claim that all
comments were individually opened or read.

Reuse: the M4 Outbox, Notification, PushDelivery, provider interface,
PostgreSQL Job Queue, Account lock and neutral presentation. Migration `0082`
adds only `(push_endpoint_id, created_at)` to bound the bucket lookup. No new
provider, broker, dependency or configuration is introduced. Provider absence
remains nonfatal for Self-Hosted and Cloud alike. This Free/Core policy adds
no entitlement or retention rule; Account/Space deletion cascades existing
technical receipts and optional preferences.
