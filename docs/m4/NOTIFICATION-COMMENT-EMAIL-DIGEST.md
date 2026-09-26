# Comment email digest backend: #515 bounded slice

`COMMENT_CREATED` remains DIGESTIBLE. Notification Settings and the own-Account
API expose its EMAIL choice only with available SMTP and a verified primary
Account address. A stored, explicit recipient-owned EMAIL preference row is
required to queue this backend path, so deployment does not start sending mail
to existing Accounts. The choice defaults off, is independent of Push and
In-App, and can be revoked if transport or the verified address disappears.
Individual per-comment mail remains forbidden.

Eligible projected comments create one content-free `EmailDelivery` and a
delayed job in the existing PostgreSQL queue. Projection time determines a
fixed UTC hour. The worker sends at most one generic mail per recipient and
Space after the hour closes. A later projection enters its current hour, not a
historical bucket. Each delivery is rechecked against current Account and
Membership, target authorization, policy, EMAIL consent, verified primary
Account email, SMTP capability and Quiet Hours before the external effect.
The recipient Account lock serializes concurrent bucket decisions. In-App
visibility and read state remain independent.

The existing EMAIL claim is durable before SMTP. A sent mail, an ambiguous
SMTP failure, or an abandoned claim closes that hour to other receipts;
at-most-once delivery favors omission over a possible duplicate. Queued
receipts coalesce with bounded technical codes. No sender, event kind, comment
text, title, target, count or Presence is copied into the job, delivery, mail
or logs. The existing generic localized message and current verified primary
address are reused. No new provider, SDK, table, migration, host setting or
mail transport is introduced; the existing `(status, created_at)` index bounds
hourly candidate lookup. A missing SMTP provider remains nonfatal.

This Free/Core behavior is identical for Cloud and Self-Hosted. Managed SMTP
cost begins only after an explicit user opt-in. No entitlement, quota,
retention, downgrade or historical backfill behavior changes. PostgreSQL
regressions cover default-off, hourly coalescing, recipient/Space separation,
opt-out, Quiet Hours, ambiguous failure and retry. Existing target-privacy and
Membership checks are shared with individual EMAIL delivery.
