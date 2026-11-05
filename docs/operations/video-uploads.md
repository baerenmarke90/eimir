# Short video uploads

Issue #88 owns the bounded first delivery. Uploads default to disabled.
Reading, deleting, exporting and restoring retained videos remain Core and do
not depend on a live processor or a current Pro grant.

## Runtime contract

Accept MP4/MOV with one H.264 or HEVC video stream, 8/10-bit 4:2:0,
4:2:2 or 4:4:4, SDR or HLG/PQ HDR, and optional AAC, MP3 or common MOV PCM
audio. The input bounds remain 180 seconds, 250 MiB and 3840×2160 (either
orientation). Non-media metadata tracks and attached cover images are excluded
from the selected media; multiple primary videos/audio tracks remain unsupported.

The single shared Memory/HeartMoment processor keeps compatible SDR 8-bit
4:2:0 H.264 and AAC streams without lossy re-encoding. Other accepted video
streams are normalized with the pinned OpenH264 encoder to even-dimension,
aspect/orientation-preserving H.264, at most 1920×1080 (either orientation),
30 fps and a 4 Mbit/s target. MP3/PCM audio is converted to AAC; existing AAC
is preserved. HLG/PQ is linearized, gamut-converted and tone-mapped using zimg
and FFmpeg, then encoded as SDR BT.709. Merely changing HDR color tags is not
conversion. The HDR base layer is supported; this is not a promise to retain
proprietary dynamic-HDR enhancement metadata.

Both paths remove container/stream metadata, chapters and H.264 SEI, produce
fast-start MP4, revalidate the strict H.264/AAC SDR output contract and duration,
and decode the entire sanitized output. Conversion drops frame side data. A
rewritten JPEG poster is generated when possible; a missing poster does not
invalidate an independently validated video. Originals are never retained as an
unvalidated playback fallback. DRM, additional containers/codecs, adaptive
streaming and external media URLs remain unsupported. Plans, avatars and
related-person photos retain image-only intake.

This repairs the general format boundary in #1649. Browser codec support is
not required: missing/ineligible local preparation sends the selected original
through this same server pipeline. No extra provider, permission, native app
implementation or couple-facing setting is introduced.

### Local preparation (#1647)

The shared Web/Capacitor client can optimize selected H.264/AAC recordings before
transfer using native WebCodecs and the bundled, unmodified Mediabunny container
library. Only one dedicated worker runs at a time. Files below 8 MiB bypass
conversion; eligible clips retain their aspect ratio and audio, with at most
1080p/30 fps and a 4 Mbit/s video target. HDR and unsupported input tracks are
not converted. Do not discard audio to make an encoder succeed.

Preparation has a 120-second wall limit and a 100 MiB output ceiling. The client
uses a result only when it is at least ten percent smaller; otherwise it uploads
the original. Failure, missing codecs or worker restrictions also use the original.
Cancellation terminates local work, including queued callers. Selected originals
remain unchanged and no media or codec diagnostics are logged or persisted.
The server remains authoritative for every codec, privacy and byte limit.

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
requested, and selected video bytes are never copied into native cache.

The raw Photo Picker proxy previously produced a real WebView
`NotReadableError`, consistent with [Chromium 40123366](https://issues.chromium.org/issues/40123366).
The chooser now owns a bounded process-local read-descriptor lease for each
supported selected video. A non-exported, read-only provider gives Chromium
stable name/type/length and independent readers on that same granted open
file. It cannot open an arbitrary source URI or write a file. The existing
Activity/renderer disposal closes every lease, fences in-flight adoption and
invalidates opaque provider URIs. No selected source URI or descriptor is
persisted or logged; process death naturally removes all leases.

Native acceptance selects the actual foreign-owned gallery item, checks
repeated Chromium File reads, independent readers, read-only/disposed ownership
and deliberate decoding/playback. The former forced DocumentsUI workaround
is superseded by this repair; it is not a second normal picker path.

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
