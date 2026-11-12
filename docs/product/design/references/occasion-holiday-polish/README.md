# Occasion agenda spacing and optional calendar holidays

Compact reference: [generated SVG](compact-reference.svg). This is a code-generated visual proposal using synthetic dates/names and the current light-theme hierarchy, not a screenshot of a tested build.

## Existing experience and Mobile Interaction Contract

This follow-up starts from the existing Planen > Anlässe month groups, all personal ImportantDate, People/profile birthdays and relationship anniversary sources, their detail sheet, focus return, and the contextual Plan action. The reference preserves these controls and the four-destination shell. It removes trailing arrows and large filled row capsules, uses smaller date chips and more space between independently touchable rows. The full row remains the tap target; the detail sheet, add/create and back behavior are unchanged.

The new low-frequency display preference lives in **Mehr > Einstellungen > Beziehung**, using the existing PreferenceSwitch. It defaults off and is local to the device, Account, instance and Space. Enabling it projects recurrent dates in the read-only agenda without writing ImportantDate records, touching a partner's preferences, sending notifications, or changing entitlements. Generated dates can start a Plan and link to the setting; authored dates retain editing and privacy. Easter and derived days are recalculated each year in UTC. Long labels wrap; small screens use one column; light/dark uses existing semantic tokens and reduced-motion inherits the shared sheet lifecycle.

## Review criteria

- At least 12 px between independent agenda rows, 48 px date marker and 68 px or larger touch row, no row-end arrows.
- The shared date picker still opens by tapping its field. Visual calendar/expand glyphs are hidden without removing the native interaction.
- New setting appears in the relationship category and persists per device Account/Space, without affecting personal records when changed.
- Annual, Easter and year-boundary dates are accurate; duplicates of matching authored annual dates do not appear.
- Verify Compact 320/390/430 px and Expanded, large text, light/dark, keyboard focus, mobile touch, and browser DatePicker behavior on a real device.
- No new managed data, backend costs, capability gates or premium restrictions. Existing Free/core occasions behavior remains available.
