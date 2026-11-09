# On-device video preparation — #1713

## Decision and ownership

The Product Owner's 2026-11-09 correction supersedes #1710/#1711's server
encoding policy: prepare on the device and never encode the uploaded video or
its audio again on the server. Baseline main is
`719cbd267e02e1c135fa2cdd63f8702eeb417cac`. Independent map/notification work
in #1712 is not included. The issue records the pre-implementation reuse,
business/freemium, cross-cutting review and existing generated whole-screen
reference. No new screen, settings or visual composition is introduced.

## Pipeline

1. The shared Memory/HeartMoment draft uploader enters the existing localized
   preparing state. Selection/removal, error recovery and draft ownership remain.
2. Android stages the granted descriptor through existing bounded private
   no-backup storage and encrypted records. Media3 1.11.1 uses local OS codecs,
   a dedicated Looper and explicit OpenGL HDR-to-SDR tone mapping. Compatible
   lower-bitrate H.264/AAC SDR files bypass encoding. A retained MOV keeps its
   real MIME type. Conversion fits either orientation into 1920 by 1080 without
   upscaling; 10 Mbit/s VBR at 1080p scales with pixels (floor 1.5 Mbit/s), with
   encoded output at most 30 fps. Audio presence, output duration and display
   dimensions are verified. Platform editing diagnostics are disabled.
3. Web uses the existing serial same-origin Mediabunny/WebCodecs worker. It
   verifies compatible originals before bypassing encoding and verifies completed
   SDR output before returning it. Capability probes and conversion use the same
   platform-selected acceleration, allowing available hardware or software codecs.
   HDR browser preparation is explicitly
   unsupported: there is no canvas relabeling, remote converter or silent
   original fallback. Unsupported codecs, timeout and worker errors preserve the
   user's selection with localized recovery. Android's HDR path requires API 29.
4. Only verified preparation creates an Attachment reservation using the actual
   prepared size/type. Native handoff atomically adopts the opaque file into the
   existing Attachment transfer. Video bytes never cross the JavaScript bridge.
   The original file remains the editor's selection; native staging cleanup does
   not discard that selection. Cancellation and owner-generation changes win
   over late preparation, before reservation/transfer.
5. Admitted videos retain existing early parent save, ordered placeholder,
   background transfer, notification and retry behavior. Preparation happens
   before admission and needs the active app; background/restart guarantees
   apply to the already staged/admitted transfer, not to an unsaved selection.
6. The shared server worker maps only the selected H.264/AAC SDR streams and
   uses stream copy. It strips metadata/chapters/SEI, writes fast-start MP4,
   checks the strict 1080p/byte/duration/gallery contract and fully decodes the
   result. Poster generation remains separate. Unprepared formats fail closed.
   Already stored media and authorization remain accessible as before.

## Resource and privacy boundaries

Input remains limited to 250 MiB, 180 seconds and 4K. The same twenty-file /
500 MiB native staging boundary applies; preparation additionally reserves one
250 MiB output allowance while the original exists. Its operation is serialized,
bounded to ten minutes, checks cancellation/current session while exporting and
verifies byte counts before adoption. Failed/cancelled preparation purges its
staging; existing session revocation, orphan cleanup and 24-hour expiry apply.
The Web worker retains its two-minute bound and releases active/queued work on
abort. No original or prepared video enters browser persistent caches.

The server's 768 MiB/deadline/process isolation, complete decoding, authorization,
parent locking, gallery publication bounds and cleanup are retained. Client
output is untrusted. No API/schema/database migration, user/provider account or
configuration is added. The feature remains Premium upload/Core retained reads,
Space-owned and identical across hosting models. Encoding compute moves to the
device; managed input/output and storage safety limits remain authoritative.

## Validation and delivery boundaries

The combined source includes #1712's upload-notice binding and mobile intake.
The shared bridge keeps one owner contract while retaining preparation,
adoption, source binding and retained notification delivery. The Android
workflow retains all eight background-transfer cases and all four real-codec
preparation cases. The compatible-recording case also verifies that a prepared,
adopted Attachment keeps its canonical parent through progress updates.

- Web: **2,827 tests passed**, with two existing skips; **48 focused bridge,
  preparation, cancellation, transfer and HeartMoment tests passed**. Typecheck,
  production/Capacitor build and touched-source formatting/lint pass.
- Browser: **33 complete video, media/planning and voice journeys pass** on the
  combined source, including the existing real codec worker, AAC retention,
  upload recovery, saved placeholders, privacy, navigation and large text.
  The original hardware-preferred configuration reproduced an unsupported-codec
  OperationError; matching the capability probe's platform choice fixes it.
  Product/test assertions were not relaxed. Temporary local Chromium
  153.0.8010.0 is recorded separately from the hosted pinned browser.
- Backend: **72 real-codec video/audio/content/streaming cases pass** using the
  pinned FFmpeg source with all three repository hardening patches. Prepared
  1080p decoded pixels and AAC packets remain unchanged; unprepared HEVC/HDR/
  high-bit-depth/non-AAC input fails closed. Truncation, metadata, poster failure
  and encrypted-container rejection remain covered. Backend source is unchanged
  from the earlier 369-file mypy pass; hosted Media Video validates the shipped
  restricted/static image and the database lifecycle.
- Native: debug APK, instrumentation APK, Lint, all **17 JVM tests**, unsigned
  release APK and AAB builds pass with **offline strict dependency verification**.
  The missing Guava parent-POM fingerprint matches both Maven Central's original
  artifact and the existing local cached artifact; no broad trust exception is
  added. Actual API 28/36/37.1 instrumentation remains a hosted requirement and is
  never inferred from compilation or browser mocks.
- CI fixture generation explicitly installs the system FFmpeg encoder for
  synthetic input only. Codec acceptance still runs the separately built,
  pinned and patched restricted processor. Generated test media is not shipped.

The first integrated native execution exposed two separate compatibility issues.
Android reports Constrained Baseline AVC as profile 65536, so comparing the
profile identifier numerically with High (8) rejected valid prepared recordings.
The native compatibility contract now explicitly includes the supported eight-bit
profiles, including Constrained Baseline/High, while rejecting High 10/4:2:2/4:4:4
and invalid identifiers. One JVM regression covers this distinction.

The unrestricted lossless HDR references signal HEVC level 255, which Android's
bounded decoder rejects. Native fixture preparation now encodes real Main 10 /
level 3.1 variants using CRF 0 with explicit VBV constraints. The lossless backend
references remain unchanged. All three native variants retain actual HLG/PQ and
BT.2020 metadata; generation checks those fields and the declared profile/level.
FFprobe 8 also emits an empty `side_data_list` for an explicitly mastered stream
even when only stream fields are requested. The generator compares every required
field explicitly, preserving the same six exact requirements across FFprobe
versions while permitting unrelated probe output.
Across all 12 frames, all 96 luminance sample centers per fixture are identical
to the original reference; the largest difference anywhere is 2/1023. The native
test additionally verifies the input's actual HDR transfer before retaining all
existing highlight, audio, duration, size and cancellation assertions.

Media3 1.11.1's bundled OpenGL PQ shader fixes maximum mastering luminance at
1,000 nits. Unknown PQ mastering and mastering/content-light peaks above that
limit now fail visibly before export; the original selection remains available.
This prevents a successful upload with silently clipped highlights. HLG and
declared PQ up to 1,000 nits use the existing platform tone mapper. There is no
server encoding fallback. Native acceptance checks actual HLG plus an explicitly
mastered 1,000-nit PQ fixture, then requires the unbounded PQ case to fail safely.
Mastering is read from the platform's CTA-861.3 field, or from bounded HEVC
codec-data SEI when MP4 extractors omit that optional field. The latter reuses
Media3's NAL boundary and emulation-prevention primitives; it does not decode a
frame or create a second metadata/codec pipeline. JVM cases cover escaped SEI,
unknown/unsupported peaks, truncated data and preserving the codec buffer.
Its 18-nit gray oracle is derived from the mapper's 500-nit SDR reference white
with gamma 2.2 (15 code-value tolerance); unchanged HDR electrical values fail
this check. All eight supported highlight steps must remain distinct.

Primary contracts: [Android codec profile identifiers](https://developer.android.com/reference/android/media/MediaCodecInfo.CodecProfileLevel)
and [x265 level/rate-control constraints](https://x265.readthedocs.io/en/latest/cli.html#cmdoption-level-idc).

Hosted exact-head checks must pass before merge. Physical-device acceptance of
appearance, tone mapping and phone performance remains separate from synthetic
codec acceptance.

An API level is not an HDR capability guarantee. The native HDR acceptance uses
the same `GlUtil.isYuvTargetExtensionSupported()` precondition as
[Media3's upstream HDR tests](https://github.com/androidx/media/blob/release/libraries/test_utils/src/main/java/androidx/media3/test/utils/HdrCapabilitiesUtil.java),
plus the platform's decoder query for the actual input track. A capable device
must complete real tone mapping and every gray/highlight pixel assertion. When
the actual GL/decoder capability is unavailable, the test still invokes the real
preparation and requires a recoverable error, byte-identical retained original,
no prepared state and no encoded output. No test is skipped. Synthetic capability
booleans are recorded without source names or URIs. An emulator's negative-capability
pass does not establish positive HDR appearance or speed on a physical phone.
Production diagnostics retain only Media3's stable error category; raw codec
messages and source URIs stay out of the error and bridge.

Deploy matching updated Web/Android/backend/media sources. Compatible old-client
uploads still work; incompatible old-client originals now fail validation rather
than silently invoking server compression. Historical lossy video requires a
new upload from its original. The latest Product Owner request authorizes merging
#1712 followed by #1714 after their gates pass; deployment and publication remain
separate delivery steps.
