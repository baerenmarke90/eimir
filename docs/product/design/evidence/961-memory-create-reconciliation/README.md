# #961 evidence: verifying an unknown Memory create outcome

Captured by `web/e2e/tests/f2-task-boundaries.spec.ts` ("an unknown create outcome is verified with the same identity and opens the one saved Memory") against the production App with only the HTTP transport replaced. The mocked server honours `Idempotency-Key`: the first `POST` commits and its response is dropped, the verification `POST` returns the original Memory with `200`.

| File | State |
| --- | --- |
| `961-verify-compact-390-light.png` | Compact 390 px, Light: input stays visible and read-only; the primary verify action sits on top of the secondary "check Moments" action. |
| `961-verify-compact-390-dark.png` | Compact 390 px, Dark, same state. |
| `961-verify-expanded-1280-light.png` | Expanded 1280 px, Light: same composition, actions right-aligned like the task's own action row. |

The same test asserts, beyond the images: no automatic replay (exactly one `POST` before the user acts), focus moves to the notice, 44 px minimum action height, axe WCAG 2 A/AA scan in Light and Dark, no horizontal overflow at 320 and 1280 px, and after verification exactly one Memory exists, the same key was sent twice, and the actual saved Memory is opened.
