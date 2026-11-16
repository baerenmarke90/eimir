# Google operator preparation: regression evidence

This slice changes operator configuration, transaction binding and polling. It
introduces no new visual composition, source chooser or consent screen. The
existing R1/F2 Memory capture task, source sheet, words/date/media hierarchy,
explicit Save, return/draft ownership, tokens and motion remain the reference.
The earlier generated [#1467 recovery reference](../README.md) remains the
composition preflight; a later material Google/UI/handoff change must refresh it.

Source hashes are in [sources.json](sources.json). Real-browser fixtures use only
synthetic data and the repository's existing media. No Google account, credential,
private photo or live provider URL was used.

- [Compact Light, 390px](capture-390-light.png)
- [Compact Dark, 390px](capture-390-dark.png)
- [Expanded Light, 1440px](capture-1440-light.png)

The existing Memory-create visual case also checked 320px reflow. All three
renders were inspected. Four existing browser journeys passed: synthetic Google
return to an unsaved draft, cancellation rejecting late bytes while keeping
words, Pro-expiry/disconnect, and the capture visual/reflow case. The local runner
used one bundled Chromium worker, no retries, and an isolated port (4371); only
the executable path/runtime configuration differed from the repository config.

These are regression checks for this preparation. They do not prove a real
Google consent/callback, installed-app return, video ingress, device/cache
retention or production eligibility. No application Google gate was opened.
