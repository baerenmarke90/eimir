# eimir. Pro feature overview evidence

The [Compact design reference](compact-reference.webp) was generated for this change with OpenAI's built-in ImageGen before UI implementation. The reference used the actual Account and Pro screens at `1ccac04079bd67224bc403ca9b84faff0e1728de`. Its illustrated price figures are placeholders. The implementation uses live store offers and the existing reference-price calculation.

The following Playwright captures show the running Web implementation at that baseline plus the Pro changes, with synthetic fixtures. No real account data or predecessor assets were used. The later Album merge was reviewed for overlap with the Pro screen and its entitlements.

- [Compact, Free, Light at 360 px](compact-free.webp). Account opens the Pro overview. Keyboard opens and closes the first group, the group animates, and Back restores Account.
- [Compact, active Pro, Dark at 390 px](compact-active.webp). The active section replaces the plan selection. The feature descriptions open immediately with reduced motion.
- [Expanded, Free, Dark at 1280 px](expanded-free.webp). Plans and descriptions use the same centered reading column.

The browser spec also exercises the overview at 320 px with 200% text. The Android wrapper shares this Web UI. Native purchase acceptance requires a Play-distributed build and a configured test account.
