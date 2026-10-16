# ADR 0001 – Clean-Room Provenance Classification

**Status:** Accepted  
**Date:** August 24, 2026

## Context

eimir. is implemented in its own repository and from a written product specification. The existing `PROVENANCE.md`, however, documents that the assistant session that started the initial implementation had immediately before, within a separate project, seen substantial parts of the predecessor source code.

Therefore, the personnel/context separation normally required by formal Clean-Room procedures between reviewing the original and implementing the replacement is not fulfilled. The dated target/actual review from August 24, 2026 explicitly records this process deviation.

## Decision

The project is **not** described as a strict or formal Clean-Room implementation.

The binding project classification is instead:

> **Independent reimplementation based on a written specification with documented prior exposure of the initial implementation session.**

The existing source tree continues. The project is not restarted solely to obtain a stricter Clean-Room process classification.

For further development, these boundaries continue to apply:

- predecessor repositories are not opened, searched, or consulted as implementation references;
- source code, comments, migrations, templates, assets, or other concrete implementation details from predecessors are not adopted;
- the complete written Master Specification is the normative functional and technical source;
- documented prior exposure remains visible in provenance and is not softened by wording changes;
- statements such as "formal clean room", "strict clean room", or equivalent unrestricted provenance claims are not used for the current source tree.

## Consequences

This decision closes the open governance point before M2 at process level. It changes no technical security requirement and does not replace the G1/M1 security gate.

If strict formal Clean-Room separation later becomes mandatory for business, contractual, or legal reasons, a new implementation based on the specification with demonstrably separate implementation context would be required. A text change cannot retrospectively make the current source tree a formal Clean-Room implementation.

This ADR is a project and provenance decision. It is **not legal advice and does not state which copyright, license, or other legal consequences result from the development process.**

## References

- [`PROVENANCE.md`](../../PROVENANCE.md)
- [`specification/CLEAN-ROOM-MASTER-SPEC.md`](../../specification/CLEAN-ROOM-MASTER-SPEC.md)
- [`docs/reviews/2026-08-24-spec-gap-review.md`](../reviews/2026-08-24-spec-gap-review.md)
- [`docs/IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md)
