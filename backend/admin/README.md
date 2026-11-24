# eimir. operator plugin (`eimir-admin`)

The operator tools of eimir. as their own Python distribution
([#2189](https://github.com/baerenmarke90/eimir/issues/2189)). They serve the
operator of an instance (support reports), never the couples.

## Boundary rules

- Import root `eimir_admin`; distribution `eimir-admin`; entry point `admin` in the
  group `eimir.plugins` (`eimir_admin.plugin:plugin`). The Core loader accepts the
  name `admin` only from this distribution.
- The plugin may import any Core module. Core never imports `eimir_admin`:
  `backend/tests/unit/test_core_imports_no_plugin.py` enforces it, and Supply Chain
  checks that the Core wheel and the Core image carry no `eimir_admin` file.
- Core reaches the plugin only through the seam (`eimir.plugins.contract.ProPlugin`).
  It provides the capability `support.operator` (`eimir.plugins.manifest.ADMIN_CAPABILITIES`),
  which is never part of a Free or Premium grant.
- It is loaded only when named in `EIMIR_PLUGINS` (for example `pro,admin`).

## Operator routes

Under `/api/v1/server-admin/support-reports` (OpenAPI tag `server-admin-support-reports`):
`listSupportReports`, `getSupportReport`, `setSupportReportState`, `setSupportReportArchived`,
`deleteSupportReport` and `replyToSupportReport`.
They need a ServerAdmin, answer `Cache-Control: private, no-store` and are a 404 while
`EIMIR_SUPPORT_REPORTS_ENABLED` is off. State, archive, delete and reply need recent authentication and write
a content-free entry (action and reporter account, never text) into the privileged audit.
`createSupportReportTicket` (`POST .../{reportId}/ticket`, title and body typed by the operator
plus a technical footer; never the note or reply) and `clearSupportReportTicket`
(`DELETE .../{reportId}/ticket`) also need recent authentication and are audited. A failed
tracker call leaves a pending link (502, retry flag); clear it before trying again.
The versioned contract `backend/openapi.json` is built with `EIMIR_PLUGINS=pro,admin`.
