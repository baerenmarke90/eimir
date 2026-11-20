# Rediscovery card tint (Wir and Momente)

Evidence for the tinted card behind the hanging Polaroid on the Wir rediscovery module and on Momente > Erinnerungen.

How these were captured:

- Local eimir. test instance with its demo Space, signed in as the demo persona Lea, web served from the PR branch.
- Browser pane of the desktop app, emulating 430 x 932 (Compact) and 1280 x 900 (Expanded), Light and Dark color scheme.
- "200-text" files: the root font size was set to 200 % to approximate large text. This is a browser-side approximation, not the Android system font scale.
- Wir shows the calm variant (a memory without a photo). Momente shows the photo variant. The photo variant on Wir was not available in the demo data and was not captured.

What to check:

- The card on Wir has the same tint as the activity cards below it in Light and Dark.
- Momente uses the identical card with string and clothespin.
- No horizontal overflow at 200 % text.
- Existing behavior outside this PR, visible in the 200 % captures: the bottom navigation label for Momente breaks mid-word.
