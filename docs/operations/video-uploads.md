# Short video uploads

Issue #88 owns the bounded first delivery. Uploads default to disabled.
Reading, deleting, exporting and restoring retained videos remain Core and do
not depend on a live processor or a current Pro grant.

## Runtime contract

The app owns video preparation before upload admission (#1713). Selected MP4/MOV
inputs remain bounded to 180 seconds, 250 MiB and 3840×2160 in either orientation.
Android uses AndroidX Media3 and platform codecs to prepare H.264/AAC SDR MP4,
without upscaling, cropping or losing orientation/sound. The 1080p target is
10 Mbit/s VBR (proportional at lower resolution, floor 1.5 Mbit/s), at most
30 fps when encoding. Compatible lower-bitrate videos remain untouched locally.
HDR is explicitly tone-mapped with Media3's OpenGL HDR-to-SDR path, supported
from API 29. Platform media-editing diagnostics are disabled.

The Web worker reuses Mediabunny/WebCodecs for supported SDR conversion and
verifies its output's duration, codecs, dimensions and audio presence. HDR is
rejected visibly in the browser rather than using device-dependent canvas
relabeling. Unavailable codecs, unsupported HDR devices, conversion errors,
timeouts and cancellation never upload an incompatible original. Selection stays
available for retry/reselection. No software codec, remote converter or new
user configuration is introduced.

Only after preparation does the client reserve the **actual** prepared MIME and
byte count. Android hands its opaque private prepared file to the existing
background transfer without serializing video bytes through JavaScript/Base64.
The shared server worker accepts prepared 8-bit 4:2:0 H.264 SDR and optional AAC,
at most 1920×1080 in either orientation. It **never encodes video or audio**.
It rejects unprepared HEVC, HDR, high-bit-depth, non-AAC or oversized-resolution
input instead of silently starting server compression.

Server work is limited to lossless selected-stream remux, metadata/chapter/SEI
removal, fast-start MP4, strict output validation and complete decoding. Decoded
video pixels and AAC packets must remain unchanged. A rewritten JPEG poster is
generated when possible; poster failure does not invalidate a verified video.
Existing isolation, memory/deadline/byte/gallery fences, authorization and cleanup
remain. Clients are untrusted; no raw upload ever becomes a playback fallback.
Plans, avatars and related-person photos remain image-only.

Deploy updated clients with the backend/media worker. Old clients can still send
already compatible videos, but incompatible originals now fail validation rather
than being compressed on the server. No schema/migration/configuration change is
introduced. Historical lossy outputs cannot regain detail without original
reupload. The dated [#1710 server-quality measurements](video-quality-1710.md)
remain historical evidence for that superseded server encoding policy.
See [device preparation and validation](on-device-video-preparation.md).

### Upload and background completion (#1655, #1701)

Capture prepares videos locally before admission; compatible originals may stay
lossless. The editor shows its existing preparing state during that bounded work.
Once admission is complete, the existing early-save/background contract applies. Images still wait for READY. An admitted VIDEO reservation is
bindable while PENDING/UPLOADING, so Memory and HeartMoment can save and show
an ordered placeholder before any video byte arrives. Only server-validated
READY output receives read/playback access. Canonical parent reads refresh
through PENDING and PROCESSING without moving the gallery slot or cover choice.

Memory creation optionally binds its gallery and cover atomically, including
sensitivity, in the same request/transaction as the text and idempotency receipt.
The exact gallery snapshot belongs to the create identity; replay never creates
another parent or repeats binding. Legacy recovered two-step attempts retain
their existing receipt format and reconciliation. A failed local draft checkpoint
does not block this verifiable online atomic save; it still blocks unsafe legacy
partial-save recovery. Offline or uncertain responses never claim success.

The shared binding exception is video-only. Unbound PENDING/UPLOADING videos
must be younger than the existing 24-hour upload retention; uploaded finalized
VALIDATING/FAILED videos retain the sixty-minute binding window. Ownership,
Space authorization, exclusive binding, parent-type rules, and 20-media / 500 MiB
aggregate limits remain enforced. Pending videos reserve declared bytes. The
worker locks the current parent before publication and checks output bytes
against the gallery, including other reservations. Upload identity/deletion
fences survive edits, and the latest sensitivity is retained. An expired bound
upload becomes an editable FAILED placeholder (`VIDEO_UPLOAD_TIMEOUT`) rather
than disappearing with its parent content.

The shared Web coordinator owns admitted transfers outside editor lifecycles,
with two concurrent requests and a 20-file / 500 MiB device staging budget. A
route change or successful save does not abort the bytes. An explicit retry
reconciles server status before reusing the same Attachment; it never re-creates
the parent. This browser transport lives only as long as the document: keep its
tab open. No service-worker background upload or browser-restart guarantee is
implied. Original videos stay out of IndexedDB and browser persistent caches.

A failed bound video records one uploader-only reference event. If validation
fails before binding, the first authorized binding records that outcome instead.
The kind inherits the existing reminder channel choices, as transfer outcomes do.
Notification projection resolves the current authorized parent, observes channel
choices/quiet hours, and sends no filename, content excerpt or success notification.
Failure placeholders remain editable after unvalidated raw bytes are purged on the
existing 24-hour schedule. Purge failures retry without exposing originals.
API, general worker and optional media worker must deploy the same revision,
including migration 0111. The existing bounded processor remains optional for
Self-Hosted and uses the same resource limits in Cloud.

The shared Memory/HeartMoment draft uploader now invokes local preparation.
A verified compatible browser original does not require an encoder; conversion
does. No failed optimization silently falls back to unprepared original bytes.

The production CSP permits compiled same-origin workers; remote/blob workers,
inline scripts and eval remain disallowed. This does not enable a new service
worker or change the PWA policy. MPL license/source notices ship in `/licenses/`.

New uploads require both the operator flag and the Space capability
`media.video_upload`. Existing video reads always use canonical parent
authorization. Mixed galleries preserve ordering and sensitive-media reveal.
The browser keeps only posters in its existing bounded image cache. Original
video files and playback grants never enter IndexedDB, service-worker caches or
persistent client storage. Unsaved selected videos use the existing volatile
selected-media lease and require re-selection after a full restart.

### Android video selection

The separate video entry uses the adopted AndroidX video-only system Photo
Picker contracts, in single or multiple mode. AndroidX falls back to the
Storage Access Framework only when the system picker is unavailable. Android
owns the localized, accessible gallery; original-photo consent stays separate.
No library-wide video access, directory-tree access or persistable grant is
requested. Selection alone retains only a process-local descriptor lease.

The raw Photo Picker proxy previously produced a real WebView
`NotReadableError`, consistent with [Chromium 40123366](https://issues.chromium.org/issues/40123366).
The chooser now owns a bounded process-local read-descriptor lease for each
supported selected video. A non-exported, read-only provider gives Chromium
stable name/type/length and independent readers on that same granted open
file. It cannot open an arbitrary source URI or write a file. The existing
Activity/renderer disposal closes every lease, fences in-flight adoption and
invalidates opaque provider URIs. No selected source URI or descriptor is
persisted or logged; process death naturally removes all leases.

Before video upload admission, Android stages the selected descriptor into private
no-backup app storage before the editor releases its selection. It uses the same
encrypted record and opaque file lifecycle for preparation, atomically adopts
that file into the confirmed Attachment transfer, and reserves one output-file
budget while encoding. An extra prepared file is never copied through the bridge. Files are capped
at 250 MiB, twenty active files and 500 MiB total; encrypted job records contain
only opaque ownership/Attachment identity, instance and progress, not parent
content, filenames or credentials. Completion, explicit removal and logout purge
staging. Failed transfers remain retryable while their bytes survive. Expired
staging and orphan files are removed at the next native staging/status operation
after 24 hours, rather than promising a wall-clock deletion while the app is dead.

Android 14+ uses user-initiated JobScheduler transfers; Android 8–13 uses a
foreground data-sync service. Both outlive the WebView/Activity and display
localized, generic progress with secret lock-screen visibility. Android 13+
requests notification permission at the first explicit upload; when denied the
OS may limit visibility to its active-task UI. Intermediate upload percentages
are persisted/notified at most once per second; the first positive percentage,
final percentage and phase changes bypass coalescing. This avoids repeated
Keystore/file/notification work throttling the byte stream on slower devices.
Job admission/progress share JobService's ordered notification queue, so a late
admission notification cannot overwrite newer progress. Interrupted running-job
notifications are removed; confirmed terminal status can remain detached.
Jobs start only from a visible
user action. They stream the existing authenticated, same-instance API route,
including with object storage, without persisting a signed URL or refresh token.
Redirects are disabled. Every request resolves current Keystore-protected
account/Space credentials; logout/replacement cancels jobs, files and sockets.
Expired authentication or a failed request retains a retryable placeholder;
foreground session refresh followed by retry resumes the same reservation.
This is not a promise to survive force-stop, reboot or an operator-disabled
processor. No native refresh-token rotation or extra sync protocol is introduced.

Native acceptance retains the actual foreign-owned gallery/Chromium selection
journeys and adds selected-file staging/revocation plus a real blocked HTTP PUT:
move the Activity to the background, observe notification progress, release the
transfer, verify byte digest and one finalize, and confirm private staging was
removed. CI runs this on the existing minimum/current Android emulator matrix.

## Optional worker

The API and general worker images contain no FFmpeg. The general worker excludes
video-validation jobs. Build the optional derivative from the **same backend
revision and immutable image digest** being deployed:

```sh
docker build -f backend/Dockerfile.media \
  --build-arg EIMIR_BACKEND_IMAGE=registry.example/eimir-backend@sha256:REPLACE_WITH_TESTED_DIGEST \
  -t registry.example/eimir-media:REVIEWED_REVISION .
```

The standalone role explicitly loads Account and Space model metadata before
processing. Without those dependencies SQLAlchemy cannot prepare Attachment
writes; importing the whole API in tests previously concealed the defect.
At startup, bounded recovery requeues only exhausted video jobs recorded with
`NoReferencedTableError` whose attachment is still a live validating video.
Deleted/ready media and all other failures are excluded. Normal validation and
its cancellation/version barriers remain authoritative on the recovered job.

The archive commit and SHA-256 are pinned in that Dockerfile. Only MOV, the
reviewed H.264/HEVC and AAC/MP3/PCM decoders, the OpenH264/AAC
encoders, file/pipe and required normalization/remux/poster filters/outputs are
compiled. OpenH264 2.7.0 and zimg 3.0.6 are source/checksum-pinned in the shared
build helper; their corresponding source and licenses ship with the image.
Autodetection, network protocols and unrelated codecs/demuxers are disabled.
The local patch rejects MOV `pssh` boxes before encryption-info allocation;
encrypted personal media is outside the accepted contract.
Source, license texts, configure output and hardening patches ship in
`/opt/eimir-media/share/ffmpeg`. No GPL/nonfree FFmpeg option is enabled.
The permissive OpenH264 source
build does not claim Cisco binary-license/patent coverage; commercial codec
licensing remains an operator/distribution review, separate from OSS compliance.
API/runtime Python dependencies and their existing audit remain unchanged.

Set `EIMIR_MEDIA_WORKER_IMAGE` to the reviewed derivative's digest.
Use the canonical Compose topology with both the normal and optional profile:

```sh
docker compose --profile self-hosted --profile video up -d
# Managed deployment:
docker compose --profile cloud --profile cloud-video up -d
```

Start and validate the worker before setting `EIMIR_VIDEO_UPLOAD_ENABLED=true`
for API and worker processes. This is an operator rollout, not couple-facing
infrastructure setup. Disable the flag to stop new admission; retained media
continues to play. Do not enable it during a partial rollout or a queue outage.
A cancelled/deleted attachment wins before the worker publishes a result.
A dead worker's lease expires; unbound/incomplete uploads, including stranded
video validation, enter ordinary 24-hour media cleanup.

The worker runs one codec job at a time, as UID 10001, with a read-only root
filesystem, a private 1 GiB temporary filesystem, one CPU, 1 GiB memory, 64 PIDs,
no Linux capabilities and no privilege escalation. Decoder processes receive
no application credentials, have a fresh process group and explicit
memory/file/CPU/FD/process/wall limits. Processing has one shared 600-second
wall deadline, including probes, normalization and complete output decode; each
child is also capped at 600 CPU seconds and 768 MiB address space. A 30-minute
job lease covers the bounded 10-minute source read plus processing and publish
overhead, with a 25-minute graceful worker shutdown. These are containment
layers, **not a claim that FFmpeg is a complete OS filesystem sandbox**. Keep the media role
separate from the API/general worker and apply the host's normal process and
network isolation. Its database/storage connection remains private.
Budget temp space for input plus sanitized output; size limits never imply
unlimited aggregate Cloud storage. Existing Space capacity/fair-use rules remain
authoritative; this change does not invent a new commercial storage allocation.

## Playback and transfer

A bearer-authenticated POST issues a five-minute, hashed, session-family- and
parent-bound read grant. Native `video` controls use that narrowly scoped URL
for bounded HTTP byte ranges; there is no general bearer in the URL.
Each request re-checks the live session family, active account, membership,
attachment and canonical parent. Logout, revocation and deletion stop subsequent
range requests. The grant expiry does not extend a session.

Responses use private no-store, no-referrer and nosniff headers.
The application log redactor already redacts `token`; reverse proxies, CDNs,
traces and monitoring **must omit query strings** on playback routes. Never
persist or include playback URLs in diagnostic events. Do not cache private
video responses at the edge. Local/S3 encrypted-at-rest readers stay seekable
and authenticate chunks; S3 uses bounded range requests with a strong ETag.
Existing bundle media transfer copies sanitized original/poster bytes through
the media abstraction; grants are transient and are never exported.

## Supply chain and acceptance

The dedicated Media Video workflow builds the restricted patched codec, runs
real parsing/remux/decode/metadata tests, and checks PostgreSQL admission,
privacy, grant revocation and publication races. Standard required CI, Android
device/picker acceptance, visual evidence and source/security review remain
cumulative merge gates. A draft or a green advisory fingerprint is not release
approval.

`tools/media/advisory-review.json` records the November 2 initial review and
the November 5 normalization-surface review. `check-advisories.py` compares the current
Debian security feed, failing on a new/removed/changed unresolved advisory.
It covers FFmpeg, OpenH264 and zimg on PRs and weekly; feed/network failure is
a failed check. Investigate changes against the actual enabled surface and patch, update sources where
possible, and record the review in the owning issue/PR. Do not regenerate a
baseline automatically or treat process limits as a fix for memory disclosure
or arbitrary code execution. CVE-2025-52290 remains undetermined upstream. The
source/build-surface review for the bounded delivery was completed on 2026-11-02.
The [reporter's disclosure](https://www.openwall.com/lists/oss-security/2026/10/20/6)
identifies an AAC/H.264 context mismatch during stream probing. The pinned
`avpriv_h264_has_num_reorder_frames` guarded null private data and SPS only.
`guard-h264-context.patch` now checks both the allocated decoder's actual codec
and the requested codec ID before touching H.264 private state. Every restricted
build compiles and executes `test-h264-context.c`: mismatched AAC allocation with
an inaccessible private pointer, null context and uninitialized H.264 state.
MPEG-TS is also excluded and input is forced MOV. This is a local reviewed defense
for the shipped build, not a claim that upstream has closed the advisory.

The authorized private test channel now builds, attests and digest-pins the
same-revision derivative through the existing sole publisher. It admits no source
until the full Media Video workflow passes. See [private test delivery](../PRIVATE-TEST-CHANNEL.md).
Ordinary production remains default off and retains its explicit operator rollout.

### HEVC/HDR security and regression evidence (#1649)

Enabling HEVC makes CVE-2026-107676 applicable to the previously excluded
dynamic-HDR path. `initialize-hdr-payload.patch` initializes all serialized
HDR10+ bytes and writes the saturation flag independently of the tone-mapping
flag, matching the parser/size calculation. Every build executes
`test-hdr-payload.c`: one through three windows, no tone mapping, saturation
flags, opposite caller-buffer poison patterns, guard bytes and round-trip
parsing. Do not treat side-data removal alone as a decoder memory-safety fix.
The existing codec-context and MOV-encryption hardening regressions remain.

Committed fixtures are synthetic colors plus a generated 440 Hz tone, with
deliberately synthetic private tags. `tools/media/generate-video-fixtures.sh`
reproduces HEVC SDR/Main10/HLG/PQ, rotated/silent video, H.264 High10 with PCM
and H.264 with MP3. The real restricted-codec tests check actual clean H.264/AAC
output, duration, orientation, audio presence, full decode, poster generation,
metadata removal and truncated-tail rejection. Personal diagnostic recordings
and extracted frames must never enter the repository or public CI artifacts.

The real HTTP upload → HEVC/HDR processor → READY database acceptance lives in
`backend/tests/media/acceptance_video_lifecycle.py`. Its deliberate `acceptance_`
name excludes this optional-binary case from generic pytest discovery. The
mandatory Media Video workflow selects that exact file alongside the unchanged
ordinary video database cases and rejects an empty or skipped result. General
normal/encrypted PostgreSQL shards keep their strict no-skips contract and all
existing cases; codec-dependent acceptance is never silently counted as passed.
Shared admission/processor fixtures live in `tests/support/video.py`.

## HeartMoment voice intake (#1671)

The same restricted media image and `video` / `cloud-video` worker profiles also
own `attachment_audio_validation`. Enable `EIMIR_AUDIO_UPLOAD_ENABLED=true` only
with the reviewed same-revision media worker. This is Free/Core and independent
of `EIMIR_VIDEO_UPLOAD_ENABLED` and video Pro admission. Normal users see only
available capture actions; they do not configure infrastructure. Turning audio
intake off preserves existing reads, deletion, essential export and queued restores.

Voice input is bounded to one audio per HeartMoment, 180 seconds decoded and
20 MiB. Ogg/Opus/Vorbis, WebM/Opus, AAC/M4A, MP3 and PCM WAV are decoded in the
network-disabled role. Bounded PCM frame count establishes duration even for live
WebM without a duration header; AAC frame padding is not mistaken for source
length. Output is metadata-stripped mono AAC/M4A. Titles/speaker labels live in
the protected HeartMoment payload. No speech provider/transcription is involved.

Transfer imports stage audio as VALIDATING and enqueue the same decoder. Manifest
size/duration/codec claims never publish playable bytes directly. Processing failure
is visible at the parent and cannot be read as valid audio. Read/authorization,
Space isolation, retention and physical cleanup reuse the existing media contract.
