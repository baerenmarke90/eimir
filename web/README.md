# Web

The Web client is intended to become a complete part of M5. For **M2-S8 / G2**,
the project first delivered a thin vertical reference flow that proves the real
Memory/Image/Story contract end to end. The first **product-oriented M2 Story
surface** now builds on this validated path: sign-in, the shared Story, and
creating a Memory with an image already use the mandatory design tokens and
screen contracts.

This is still **not complete M5 client parity**. This slice does not pull full
navigation, detail screens, deep links, an offline read cache, export/import,
or M3+ features forward.

The client uses only the backend's versioned REST/OpenAPI interface. Domain,
privacy, and authorization rules remain in the Application Core.

## Generated API layer

`src/api/generated/` is generated from `backend/openapi.json` and is **not
edited manually**. Regenerate it with `tools/openapi/generate.sh`; CI verifies
that the committed output matches the contract.

The directory contains only DTOs and endpoint calls. UI, state, and flow
orchestration live outside it.

## Current M2 Web slice

The Web slice uses React, TypeScript, Vite, React Router, and TanStack Query as
required by the Master Specification and the existing reuse decision. It adds
no new UI library.

The critical flow remains unchanged:

1. sign in through the published authentication contract;
2. create a Memory through `MemoriesApi`;
3. upload an image through `AttachmentsApi` and the returned `UploadDescriptor`;
4. finalize, wait for READY, and bind the attachment to the Memory;
5. load `/timeline` through `StoryApi`;
6. process the generated `StoryItem` union through `kind`;
7. perform an authorized image read as part of the E2E proof.

The product-oriented surface adds:

- user-oriented sign-in without M2/G2 engineering terminology;
- a dedicated `/story` route;
- the `/memory/new` creation route;
- monthly grouped Story cards for Memory, HeartMoment, and Milestone;
- visible shared visibility when creating a Memory;
- loading, empty, success, and error states;
- responsive Compact, Medium, and Expanded layouts;
- design tokens and 44 CSS-pixel target sizes from the platform handoff.

### Configuration

Technical values are operator configuration and are not exposed to normal
users as input fields:

- `VITE_EIMIR_API_BASE_URL` — API base URL; an empty value uses same-origin.

The active Space is derived only after authentication from the account's server-authorized Memberships; it is not a build-time or operator value.
Access and refresh tokens remain exclusively in ephemeral React state. Logout
clears state and the TanStack Query cache; M2 introduces no persistent offline
or read-cache policy.

### Local source workflow

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

`typecheck`, `lint`, and `format:check` are separate gates. Biome lints and
checks formatting for handwritten Web code; the generated OpenAPI client under
`src/api/generated/` remains excluded. `npm run format` applies Biome formatting
locally.

Git-ignored paths are excluded as well. `vcs.useIgnoreFile` in `biome.json`
reads the repository `.gitignore`, so `vcs.root` points to the parent directory.
Without this setting, Biome would inspect `dist/` after a local `npm run build`,
and `lint` and `format:check` would fail on generated bundle code. CI did not
expose this because it starts from a fresh checkout without `dist/` and runs the
build only after those gates.

### Self-Hosted

The production build runs in an unprivileged Nginx container. In the local
Compose test, it serves static files at
`http://127.0.0.1:${WEB_PORT:-8080}` and proxies `/api/` internally to the API
service. The browser therefore remains same-origin and needs no broad CORS
allowance.

After sign-in, the Web client discovers the account's active Memberships through
the authenticated API and uses only a server-authorized Space ID. No Space UUID
is embedded in the Web image or configured by the operator.

In public operation, `/api/` must not be routed through the Web container. The
TLS reverse proxy routes `/api/` directly to the API host port and all remaining
paths to the Web host port. See `docs/SELF-HOSTING.md` for the complete guide.

## Deliberate M2 boundary

The global product navigation `Heute · Story · Planen · Entdecken · Mehr`
remains localized product copy and is not presented as a collection of dead
links. This slice first productizes the implemented Story surface. Complete
navigation and systematic feature parity remain in M5.

Video, offline write sync, export/import, global search, and M3+ features also
remain outside this slice.
