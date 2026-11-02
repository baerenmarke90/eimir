# Short video uploads

Issue #88 owns the bounded first delivery. Uploads default to disabled.
Reading, deleting, exporting and restoring retained videos remain Core and do
not depend on a live processor or a current Pro grant.

## Runtime contract

Accept MP4/MOV with one 8-bit 4:2:0 SDR H.264 video stream and optional AAC
audio, up to 180 seconds, 250 MiB and 3840×2160 (either orientation).
The processor selects only these streams, removes container/stream metadata,
chapters and H.264 SEI, remuxes to fast-start MP4, probes the result, and decodes
the entire sanitized file. It generates a rewritten JPEG poster when possible.
A missing poster does not invalidate an independently validated video.
No transcoding, HDR, HEVC, DRM, adaptive streaming or external media URL is
supported. Plans, avatars and related-person photos retain image-only intake.

New uploads require both the operator flag and the Space capability
`media.video_upload`. Existing video reads always use canonical parent
authorization. Mixed galleries preserve ordering and sensitive-media reveal.
The browser keeps only posters in its existing bounded image cache. Original
video files and playback grants never enter IndexedDB, service-worker caches or
persistent client storage. Unsaved selected videos use the existing volatile
selected-media lease and require re-selection after a full restart.

### Android video selection

The separate video entry uses Android's system document picker with
`ACTION_OPEN_DOCUMENT`, a video MIME filter and selected-file read grants.
It requests neither library-wide video access nor directory-tree access, and
does not retain a persistable grant or copy selected videos into native cache.
The Photo Picker proxy path produced a real WebView `NotReadableError` in
native acceptance, consistent with the upstream proxy-metadata issue reviewed
in [GutenbergKit #447](https://github.com/wordpress-mobile/GutenbergKit/issues/447)
and [Chromium 40123366](https://issues.chromium.org/issues/40123366).
The [Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)
provides the existing OS alternative. Android owns the localized, accessible
file-browser UI; original-photo consent remains separate. Native acceptance
selects the actual foreign-owned document and reads its Chromium File bytes.

## Optional worker

The API and general worker images contain no FFmpeg. The general worker excludes
video-validation jobs. Build the optional derivative from the **same backend
revision and immutable image digest** being deployed:

```sh
docker build -f backend/Dockerfile.media \
  --build-arg EIMIR_BACKEND_IMAGE=registry.example/eimir-backend@sha256:REPLACE_WITH_TESTED_DIGEST \
  -t registry.example/eimir-media:REVIEWED_REVISION .
```

The archive commit and SHA-256 are pinned in that Dockerfile. Only MOV, H.264,
AAC, file/pipe, required remux/poster filters and outputs are compiled.
Autodetection, network protocols and unrelated codecs/demuxers are disabled.
The local patch rejects MOV `pssh` boxes before encryption-info allocation;
encrypted personal media is outside the accepted contract.
Source, license texts, configure output and patch ship in
`/opt/eimir-media/share/ffmpeg`. No GPL/nonfree or external encoder library is
enabled. API/runtime Python dependencies and their existing audit remain unchanged.

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
memory/file/CPU/FD/process/wall limits. These are containment layers, **not a
claim that FFmpeg is a complete OS filesystem sandbox**. Keep the media role
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

`tools/media/advisory-review.json` records the 2026-11-02 upstream advisory
evidence and applicability review. `check-advisories.py` compares the current
Debian security feed, failing on a new/removed/changed unresolved advisory.
It runs on PRs and weekly; feed/network failure is a failed check. Investigate
changes against the actual enabled surface and patch, update sources where
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
