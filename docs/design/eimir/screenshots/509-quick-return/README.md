# #509 Quick Create Heart Moment return — Web evidence

These are captures of the production Web shell and Heart Moment task in hosted Chromium, not the generated product reference. They come from [Web Browser QA run 36591825532](https://github.com/baerenmarke90/eimir/actions/runs/36591825532), implementation head `72ac79d7553db9a3243fc5c01517a8250b5df374` ([artifact](https://github.com/baerenmarke90/eimir/actions/runs/36591825532/artifacts/11044506670)).

| State | Image |
| --- | --- |
| Compact 390 Quick Create sheet over loaded Today | `shell-heart-quick-create-sheet-390.png` |
| Compact 390 Heart Moment create reached from the sheet, with scoped Back | `shell-heart-quick-create-task-390.png` |

The same browser test opens the sheet, cancels and reopens the task, saves a textless tagged Heart Moment, confirms the canonical result, returns to Today and checks focus on the Quick Create trigger. The test asserts Today loaded without an error before capture. [The Product Design preflight](../../../../product/design/509-quick-create-heart-return.md) records the navigation boundary. The unchanged result, Compact Light/Dark, 320, large-text, small-height and Expanded composition is evidenced by [the preceding Heart Moment capture set](../509-heart-tags/README.md). This Web navigation slice does not claim native Android device acceptance.
