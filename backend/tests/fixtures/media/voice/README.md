# Synthesized voice-codec fixtures

Generated locally with FFmpeg from its sine/anullsrc sources for decoder acceptance.
No recorded speech, user media, external samples or third-party music. Short files
contain 0.8 seconds at 440 Hz and explicit private title/comment markers; long-live
contains 181 seconds of silence in a live WebM container without a duration header.
These files test actual codec, metadata stripping and decoded-duration boundaries.
