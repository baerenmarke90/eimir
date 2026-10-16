# OpenAPI Client Generation

The canonical Web product and the Capacitor Android wrapper around it share one
versioned contract and one generated client. This layer generates the
mechanical parts—DTOs and endpoint calls—from `backend/openapi.json` instead of
maintaining them manually.

It explicitly generates **no** domain, UI, or state logic.

```text
FastAPI  ->  backend/openapi.json  ->  openapi-generator  ->  web/src/api/generated  (TypeScript)
```

The Android app packages the Web bundle (ADR 0011), so it consumes this
TypeScript client as well. There is no Kotlin/Swift client and no second
generated output to keep in sync.

## Usage

```bash
tools/openapi/generate.sh                # regenerate
tools/openapi/generate.sh --check        # check for drift only (CI)
tools/openapi/generate.sh --check-web    # alias of --check, kept for CI compatibility
```

Docker is the only prerequisite, and the Self-Hosted stack already requires
it. No local JDK or Node installation is needed.

## Why this generator

`openapi-generator` with the `typescript-fetch` template generates lean
TypeScript code against the browser Fetch API. Alternatives considered:

- **openapi-typescript + openapi-fetch** generates lean TypeScript code too, but
  the generator was already pinned by version and digest, so switching adds a
  second tool, pin and license review without changing the result.
- **orval**, **hey-api**, and **oazapfts** are TypeScript-only alternatives with
  the same trade-off.
- **swagger-codegen** is the predecessor of openapi-generator; active
  development continues in the latter.

## Why generated code is committed

The `backend/openapi.json` contract is already committed and checked against the
real ASGI application. Client code follows the same approach:

- A contract break is **readable** as a pull-request diff instead of appearing
  only as a failed CI step.
- Web (and therefore Android packaging) builds need neither Docker nor network access to start.
- The drift check is a comparison, not a second generation path that could
  itself diverge.

The tradeoff is a larger diff for contract changes. This is intentional: a
change to the client interface *should* be visible during review.

## Runtime dependencies

**TypeScript:** none. The `typescript-fetch` generator targets the browser Fetch
API. It creates no `package.json`, and generated files import nothing outside
their own directory—verified rather than assumed.

## Licenses

`openapi-generator` is licensed under **Apache-2.0**. The tool runs only at
build time and is not distributed; Apache-2.0 imposes no conditions on the
generated output. Generated code is therefore project code under the project
license.

The container is pinned by both version **and** digest
(`tools/openapi/generator.env`). A reassigned tag therefore cannot silently
produce different client code.

## Updating

1. Enter the new tag in `generator.env`.
2. Run `docker pull openapitools/openapi-generator-cli:<tag>` and record the
   reported digest.
3. Run `tools/openapi/generate.sh`.
4. Explain the resulting diff in the pull request—a generator change modifies
   client code and is a review concern, not a formality.
