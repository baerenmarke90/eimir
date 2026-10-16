# #509 Quick Create Milestone return — Web evidence

These six captures are from [Web Browser QA run 36598511469](https://github.com/baerenmarke90/eimir/actions/runs/36598511469) in hosted Chromium, implementation head `a4cec8eea151cf511bea0996bff6ae1c30df684e` ([exact-build artifact](https://github.com/baerenmarke90/eimir/actions/runs/36598511469/artifacts/11047737100)). They show the existing product shell, sheet/menu, Milestone create page and confirmed detail. They are implementation evidence, not generated design references.

| State | Compact 390 | Expanded 1440 |
| --- | --- | --- |
| Quick Create over loaded Today | [sheet](shell-milestone-sheet-390.png) | [menu](shell-milestone-sheet-1440.png) |
| Milestone task with validated scoped Back | [create](shell-milestone-task-390.png) | [create](shell-milestone-task-1440.png) |
| Confirmed canonical result | [detail](shell-milestone-result-390.png) | [detail](shell-milestone-result-1440.png) |

The same browser spec checks no initial keyboard focus; Cancel and Back to Today; a single confirmed create request; the actual saved detail; edit Cancel and edit Save; return to Today with focus restored to Quick Create; and direct-entry fallback to Story. The fixture renders Today without an unrelated Daily Quote error. Existing Light/Dark and reflow composition is unchanged by this navigation correction. [The preflight](../../../../product/design/509-quick-create-milestone-return.md) records the contract and reuse decision. Native device acceptance is outside this Web slice.
