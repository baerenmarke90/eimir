# eimir. Accessibility and QA Matrix

**Status:** Release gate for Web and the Android wrapper (which packages the Web product)  
**Version:** 1.0  
**As of:** August 24, 2026

eimir. treats accessibility, privacy, and adaptive presentation as product quality. The target standard is WCAG 2.2 AA for the WebApp; the Android app is the Capacitor wrapper around that WebApp (ADR 0011), so it inherits the same semantics and adds only the platform checks below.

## 1. Testing principles

- Automated checks find common errors; manual operation remains mandatory.
- A platform must not mark a flow as complete if the other platform differs in domain behavior.
- Critical paths are tested with real assistive technologies, not only simulator flags.
- Test data is synthetic and contains no real private content.
- Privacy, cross-tenant, and accessibility defects block a release.

## 2. Mandatory test environments

### Web

- current and previous stable versions of Chrome/Chromium and Firefox,
- current stable Safari on macOS/iOS where the WebApp is supported,
- Chromium-based Edge on Windows,
- keyboard-only,
- at least NVDA or JAWS on Windows and VoiceOver on Apple platforms,
- 200% browser zoom and operating-system contrast mode.

### Android

- the oldest Android version actually supported by the project,
- the current stable Android version,
- small smartphone, large smartphone, tablet/Expanded window,
- portrait, landscape, and window resizing,
- TalkBack, large font/display size, Switch Access or comparable switch control,
- reduced motion and high contrast where provided by the system.

The concrete version list is generated per release from browser support and Android build configuration and is not permanently frozen in this document.

## 3. Accessibility matrix

| Area | Web check | Android check | Release criterion |
|---|---|---|---|
| Semantics | native elements, correct roles/names | same DOM semantics exposed through the WebView accessibility tree | name, role, value, and status are understandable |
| Keyboard/switch | Tab, Shift+Tab, Enter, Space, Escape, arrow keys | Switch Access, external keyboard | every action is reachable without touch/mouse |
| Focus | visible, logical, returns after overlay | stable TalkBack/keyboard focus | no focus loss or focus trap |
| Headings | unique H1, logical levels | screen/section title announced | quick orientation is possible |
| Navigation | Skip Link, landmarks, active navigation | clear Bottom/Rail semantics | current location is identifiable |
| Text scaling | 200% zoom without loss of function | largest supported font/display size | no required text is clipped |
| Contrast | WCAG 2.2 AA | same semantic color pairs | text/controls meet minimum values |
| Color | status also conveyed by text/shape/icon | status also conveyed by text/shape/icon | no color-only encoding |
| Touch/click target | at least 44 × 44 CSS px | at least 48 × 48 dp | core target is operable without a precision gesture |
| Motion | `prefers-reduced-motion` | system reduced-motion option | no information loss without animation |
| Forms | label, hint, error association, autocomplete | label, error, appropriate keyboard | errors can be found and corrected |
| Media | alt text/description, caption status | Content Description/Description | meaning is available without image/audio |
| Live status | appropriate live region | polite status announcement | Saving/Error is announced; focus remains |
| Overlays | focus trap, Escape, return | Back, focus, drag only supplementary | fully closable and operable |
| Time limits | extension/explanation | extension/explanation | no surprising data deletion |

## 4. Flow matrix

| Critical flow | Keyboard/TalkBack | large text | Offline/network | Privacy/Security | Deep Link/Back |
|---|---:|---:|---:|---:|---:|
| Sign-in/Passkey/Magic Link | Required | Required | Required | Required | Required |
| Create Space | Required | Required | Required | Required | Required |
| Accept invitation | Required | Required | Required | Required | Required |
| Memory + media | Required | Required | Required | Required | Required |
| HeartMoment private/shared | Required | Required | Required | Required | Required |
| Wish → Plan | Required | Required | Required | Required | Required |
| Story search and detail | Required | Required | Required | Required | Required |
| 409 conflict | Required | Required | Required | Required | Required |
| Export/account action | Required | Required | Required | Required | Required |

## 5. State matrix for each data-backed view

Every screen is tested visually and functionally in at least these states:

| State | Expectation |
|---|---|
| Initial | no random stale content or layout shifts |
| Loading | structural skeleton, understandable semantics |
| Content | core task fully operable |
| Empty — first use | benefit and appropriate starting action |
| Empty — filter/search | filter reason and reset action |
| Validation Error | input remains; focus/error summary works |
| 401 | re-authentication with preserved destination |
| 404 | neutral; does not reveal existence of foreign content |
| 409 | no silent overwrite; explicit decision |
| 429 | wait time and bounded retry |
| 5xx | existing data remains; retry possible |
| Offline Cache | data age/state and read-only status clearly visible |
| Offline Write | de-DE product copy example: **„Noch nicht gespeichert“**; no sync promise |

## 6. Responsive QA

At least these widths are tested per template:

- 320 px: narrowest realistic Compact case,
- 599 px: upper Compact boundary,
- 600 px and 839 px: Medium boundaries,
- 840 px: start of Expanded,
- 1280 px and 1440 px: typical desktop widths.

Additionally:

- long German text and at least one language with longer labels,
- 200% text zoom without horizontal scrolling of the core task,
- switching between single- and multi-pane without losing selection, draft, or focus,
- soft keyboard does not cover required fields or completion actions,
- safe areas, display cutouts, and system bars are considered.

## 7. Forms

- Every field has a permanently visible label.
- Required/optional status is explained textually or systematically.
- Errors appear at the field and, for long forms, additionally in a focusable summary.
- On submit, focus moves to the first invalid field or to the error summary.
- An error disappears only when its cause has been corrected or validation has run again.
- Autocomplete, input type, and password managers work.
- Copy/paste is not blocked without a security reason.
- Disabled actions explain missing prerequisites.
- Unsaved input survives harmless layout changes and network errors.

## 8. Navigation and overlays

- The Skip Link on Web leads directly to the main content.
- Main navigation has a consistent order and active state.
- Browser Back and Android System Back first close contextual overlays or navigate through the expected history.
- Dialog focus starts meaningfully, remains in the dialog, and returns to the trigger.
- Bottom Sheets are not operable only by drag.
- Multi-pane selection is exposed as a selection to assistive technologies.
- Deep Links return to their destination after authentication.

## 9. Privacy and Security QA

For every `OWNER_ONLY` domain, the following are tested separately:

- list and detail,
- search and result count,
- dashboard and Story,
- notification and preview,
- export,
- relationships and comments,
- attachments and signed URLs,
- update and delete,
- Web read cache inside the Android WebView,
- Web query/browser cache,
- logs, analytics, and crash reporting.

Tenant matrix:

```text
Account A / Space A / member       → allowed
Account B / Space A / partner      → allowed for SPACE_SHARED
Account B / Space A / partner      → never for OWNER_ONLY owned by A
Account C / Space B                → never access Space A
Anonymous                          → never access
```

## 10. Media QA

- actual MIME type, size, and image dimensions are validated server-side,
- invalid, oversized, and manipulated files return safe errors,
- progress, cancel, retry, and partial success are operable,
- an expired signed URL is renewed without making content public,
- alt text/description can be entered and edited,
- videos show duration and caption status,
- file name and metadata do not unintentionally appear in analytics or storage paths.

## 11. Automated gates

### Web

- lint and typecheck,
- component tests for role, name, keyboard, and focus,
- automated accessibility checks for P0 components and critical screens,
- visual regression for Compact and Expanded,
- router tests for Deep Link and Back,
- contract tests against OpenAPI examples.

### Android wrapper

Product behavior is covered by the Web automation above; there is no second
native UI to test. The wrapper adds:

- strict-dependency-verified `assembleDebug` / `assembleRelease` / `bundleRelease`,
- `npm run cap:check` for the Capacitor configuration, identity and safe-area contract,
- release evidence checks of package identity and the local Web bundle,
- a real-device smoke test (install, cold start, Back, safe areas, background/resume) when the wrapper or a native capability changes.

Automation does not replace manual testing with a screen reader/TalkBack and a real keyboard/switch-control setup.

## 12. Severity and release

| Severity | Example | Effect |
|---|---|---|
| Blocker | foreign/private content visible, login not operable | stop release |
| Critical | core flow not possible by keyboard/TalkBack | stop release |
| High | focus loss, clipped text, destructive action unclear | fix before release |
| Medium | inconsistent announcement or unnecessary focus path | fix promptly |
| Low | small non-blocking visual deviation | fix as planned |

## 13. Definition of Done

- All Required cells in the flow matrix have been tested.
- No Blocker, Critical, or High findings are open.
- Automated gates run reproducibly in CI.
- Manual results state platform, version, assistive technology, and test date.
- Privacy tests cover indirect leaks and caches.
- Known Medium/Low findings have an owner and target date.

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/)
- [Android Accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)
- [User Flows](./USER-FLOWS.md)
- [Screen Templates](./SCREEN-TEMPLATES.md)
