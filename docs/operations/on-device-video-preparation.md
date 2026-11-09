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
   SDR output before returning it. HDR browser preparation is explicitly
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

- Web: all 2,801 tests passed, two existing skips; 39 focused preparation,
  reservation, background transport, cancellation and revocation cases passed.
  Production typecheck/build and touched-source formatting/lint were checked.
- Backend: 75 focused real-codec/media/privacy cases passed. Prepared 1080p
  decoded pixels and AAC packets remain unchanged; unprepared HEVC/HDR/high-bit
  depth/non-AAC input never produces an output. Truncation, unknown metadata,
  poster failure and encryption-initialization rejection remain covered.
  Full mypy passes 369 source files. Local acceptance uses the pinned FFmpeg
  source with all three repository hardening patches, built without the now
  unused OpenH264/zimg encoding dependencies; hosted Media Video still verifies
  the exact shipped restricted/static image. System FFmpeg alone does not satisfy
  the encrypted-container rejection and is not recorded as a complete pass.
- Native: debug APK and instrumentation APK builds, Android Lint and all 13
  JVM tests pass locally. The final offline rebuild also passed strict dependency verification. Settings JVM tests and real platform instrumentation cover private
  staging/adoption with exact sizes, compatible byte identity, high-resolution
  encoding with audio, HLG/PQ neutral highlights and cancellation. They are wired
  into the existing API 28/36/37.1 workflow; no runtime pass is inferred from
  source inspection or a successful Web test. Native build/instrumentation and
  hosted exact-source results must be checked before merge readiness.
- Local browser provisioning was attempted: the pinned Playwright download
  returned a non-ZIP payload, and a separately extracted official Chrome binary
  failed to start in this execution environment. No local browser pass or new
  screenshot evidence is claimed. Existing complete video journeys remain
  selected, with ordinary hosted browser/axe validation.

Deploy matching updated Web/Android/backend/media sources. Compatible old-client
uploads still work; incompatible old-client originals now fail validation rather
than silently invoking server compression. Historical lossy video requires a
new upload from its original. No merge, deployment or release is authorized by
this task. The supplied stadium recording's appearance and phone performance
remain physical-device acceptance; no guarantee is inferred from synthetic media.
