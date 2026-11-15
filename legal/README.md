# Legal documents

This directory is the canonical source of eimir.'s user-facing legal documents.
They are localized product content: each document is written in the language of
its locale directory (for example `de/`). This README, file names, front matter
keys and all tooling stay English, following exception 1 of
[`docs/ENGINEERING-LANGUAGE.md`](../docs/ENGINEERING-LANGUAGE.md).

| Document | Locale | File | Status |
| --- | --- | --- | --- |
| Terms of use (Nutzungsbedingungen) | de-DE | [`de/terms-of-use.md`](de/terms-of-use.md) | Draft, not in force, legal review pending |
| Privacy policy (Datenschutzhinweise) | de-DE | [`de/privacy-policy.md`](de/privacy-policy.md) | Draft, not in force, legal review pending; see [review notes](privacy-policy-review.md) |

## Rules

- A document with `status: draft` in its front matter is not in force. It must
  not be presented to users as binding; outside non-public test deployments it
  must not be used as an acceptance target.
- `[[UPPER_CASE]]` placeholders mark facts that must be decided before
  publication, such as the provider identity, contact channels and public URLs.
  A document with unresolved placeholders must not be published.
- Publication requires a documented legal review and a Product Owner decision.
  The repository text is a drafting baseline, not legal advice.
- `version` identifies the exact text a person accepted. Every change to a
  published text needs a new version. Published versions stay retrievable
  through Git history.
- The terms of use govern eimir. Cloud, the official apps and eimir. Pro. They
  do not govern the relationship between users and the operator of a
  Self-Hosted installation.
- The privacy policy informs (Art. 13 GDPR) about eimir. Cloud and the official
  apps. It is never accepted, never bundled with the terms acceptance and never
  blocks a flow. Every statement must describe processing the repository
  actually implements; [`privacy-policy-review.md`](privacy-policy-review.md)
  maps each statement to its source and lists the open legal decisions.
  Self-Hosted operators are their own controllers and provide their own notice. The source code license remains
  [`LICENSE`](../LICENSE) (PolyForm Noncommercial 1.0.0).
- Statements in these documents must stay consistent with
  [`docs/BUSINESS-MODEL.md`](../docs/BUSINESS-MODEL.md),
  [`docs/FREEMIUM-FEATURE-MATRIX.md`](../docs/FREEMIUM-FEATURE-MATRIX.md),
  [`docs/PREMIUM-BILLING-STRATEGY.md`](../docs/PREMIUM-BILLING-STRATEGY.md),
  the offboarding and deletion contracts in [`docs/m6/`](../docs/m6/) and the
  privacy wording rules in
  [`docs/CONTENT-PRIVACY-GUIDELINES.md`](../docs/CONTENT-PRIVACY-GUIDELINES.md).
  A product change that contradicts a published statement needs a new document
  version before or with the change.

## Delivery and acceptance

- `web/scripts/generate-legal-documents.mjs` converts each document into a
  checked-in typed module under `web/src/i18n/locales/legalDocuments/`. `npm run legal:check` (part
  of `npm test` and `npm run build`) fails when the module is stale, and the
  strict reader rejects any Markdown construct outside the supported subset.
  A `published` document with unresolved placeholders is rejected as well.
- The Web app renders the bundled texts on the public routes `/legal/terms`
  and `/legal/privacy` and in reading sheets in the signup form: the terms next
  to the required checkbox, the privacy policy in an informational sentence
  below it. Both work offline and need no session. Links between the documents
  open a nested reading sheet inside a form, so typed input is kept.
- `backend/src/eimir/legal/terms.py` holds the version a new eimir. Cloud
  Account must accept; a unit test keeps it equal to the front matter.
  `GET /instance/status` publishes it as `termsOfUseVersion` (null on
  Self-Hosted). Acceptance is stored per Account and version in
  `terms_acceptances` and deleted with the Account.
- A draft may be accepted only on non-public test deployments, where the page
  shows it as a draft. Publishing eimir. Cloud requires a `published` version.

Changing a document therefore means: edit the Markdown, bump `version`, run
`npm run legal:generate` in `web/`, and, for the terms of use, update
`TERMS_OF_USE_VERSION`. The privacy policy has no acceptance version; its
`version` identifies the text shown.
Existing Accounts keep their recorded acceptance; asking them to accept a new
version is a separate, not yet implemented flow.
