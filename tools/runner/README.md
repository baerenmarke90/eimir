# eimir-dev Actions runner

The repository runner uses GitHub just-in-time registration. Its launcher boots
a fresh Ubuntu 24.04 guest for each job. Run `provision-eimir-runner.sh` as root
from guest cloud-init before registering the nightly runner. The host launcher
must supply a dedicated toolcache disk mounted at `/srv/eimir-runner-toolcache`
and set `RUNNER_TOOL_CACHE` to `/srv/eimir-runner-toolcache/tools`. The Secret
Scan PR pilot needs its own fresh guest without that disk.

Nightly guests register with `eimir-kvm-nightly` and a second label derived
from the GitHub run ID and attempt. The dispatcher must match both labels and
verify the run identity before jobs start. The PR pilot keeps `eimir-kvm-pr`.

The script installs Docker with Buildx and Compose, the CLI and media build dependencies,
and Chromium libraries from the Ubuntu package repositories. It verifies the
pinned upstream GitHub CLI archive before installing the attestation command.
Playwright jobs in the pinned Node container install their own Chromium libraries.
Guest sudo authorizes the two exact `apt-get` commands used by Media Video. The
runner's Docker membership already grants root-equivalent access inside that
guest. The host Docker socket and host files are outside the guest.

The launcher discards the guest workspace, Docker images, containers, volumes,
networks and listening processes when the job exits. The dedicated tool disk
retains setup-action toolchains and the verified GitHub CLI archive. Run
**Runner Capability Check** from the Actions tab after provisioning changes to
verify the guest before scheduling full regressions.

## Host files

| Repository file | Host path |
| --- | --- |
| `eimir-actions-guest-probe` | `/usr/local/sbin/eimir-actions-guest-probe` (root, 0755) |
| `eimir-actions-dispatch` | `/usr/local/sbin/eimir-actions-dispatch` (root, 0755) |
| `measure-guests.sh` | `/usr/local/sbin/eimir-actions-measure-guests` (root, 0755) |
| `provision-eimir-runner.sh` | `/etc/eimir-actions/provision-eimir-runner.sh` (root, 0644) |
| `eimir-actions-image.service`, `eimir-actions-image.timer` | `/etc/systemd/system/` |

The unit `/etc/systemd/system/eimir-actions-dispatch.service`, its environment
file `/etc/eimir-actions/dispatch.env` and the GitHub App key stay host-only.
The unit loads the key as the `github-app-key` credential. After #2115 merges,
set `EIMIR_NIGHTLY_MAIN_ENABLED=true` and `EIMIR_TEST_CHANNEL_MAIN_ENABLED=true`
in `dispatch.env`. Without them the runner does not pick up nightly jobs on
`main` or test-channel jobs.

Install or update the host files from one pinned commit, while no guest runs:

```bash
curl -fsSL https://raw.githubusercontent.com/baerenmarke90/eimir/<commit>/tools/runner/install-host.sh | sudo bash -s <commit>
```

The installer first takes every launcher lock and stops if a guest runs. It
then pauses the dispatcher, keeps `.bak-2115-slots` copies of the replaced
files and `dispatch.env`, and installs the files above. It creates the slot 2
account, moves the existing toolcache to slot 1 and copies it for slot 2. It
sets `EIMIR_NIGHTLY_VALIDATION_SHA` to the installed commit, so the dispatcher
admits branch validation runs of exactly that revision, and restarts the
dispatcher. It changes no other `dispatch.env` line. Pass `rollback` instead
of the commit to restore the saved files.

## Guest slots

The dispatcher runs up to two guests at once, one per launcher slot. It
selects jobs and pins each guest to the run identity exactly as the
single-guest dispatcher did. A job with a starting or running guest gets no
second one. The Secret Scan PR guest also occupies a slot.

| Per slot | Slot 1 | Slot 2 |
| --- | --- | --- |
| Account (firewall match, file owner) | `eimir-actions-vm` | `eimir-actions-vm2` |
| Lock | `slot1.lock` | `slot2.lock` |
| Transient unit | `eimir-actions-network-probe-slot1.service` | `eimir-actions-network-probe-slot2.service` |
| nft table | `eimir_actions_slot1` | `eimir_actions_slot2` |
| Toolcache disk | `nightly-toolcache-slot1.ext4` | `nightly-toolcache-slot2.ext4` |

Each job gets its own copy-on-write overlay in a fresh job directory. Guests
hold `launcher.lock` shared; an image build holds it exclusively, so it starts
only while both slots are idle.

Nightly guests get 3 vCPUs (`CPUQuota=300%`) and 3584 MiB RAM each. Their
largest measured peak at 3072 MiB was 2.51 GiB of the 2.9 GiB the guest sees.
The host has 9.7 GiB and six vCPUs on a four-core, eight-thread i7-8665U, so
two busy guests share physical cores. A guest stops after 95 minutes: the
longest nightly job limit (Browser full regression, 80 minutes) plus 15 minutes
for boot and registration. A guest that receives no job within 15 minutes
stops and frees its slot, because a second runner for the same run can find
the run's last job already taken. PR guests keep 2 vCPUs and 3072 MiB.

Each nightly guest reports peak RAM and disk, CPU steal and pressure stall
times in the dispatcher journal (`EIMIR_ACTIONS_PROBE job_resources`). During a
full regression, record host-side readings per slot every 10 seconds:

```bash
sudo eimir-actions-measure-guests | tee ~/eimir-measure.csv
```

```bash
eimir-actions-measure-guests summary ~/eimir-measure.csv
```

## Prepared runner image

Provisioning every guest during boot cost about 2 minutes per job: packages,
the GitHub CLI and the Actions runner download. The run on 2026-11-20 measured
2:35–2:53 from guest start to job start. `eimir-actions-guest-probe image` boots
one guest from the verified Noble image. That guest runs
`provision-eimir-runner.sh image`, installs the pinned Actions runner and powers
off. The launcher then flattens it into the read-only
`/var/lib/eimir-actions-vm/noble-eimir-runner.qcow2`.

Nightly and test-channel guests (`jit-nightly`) start from a fresh copy-on-write
overlay of that image. They only mount the toolcache and run
`provision-eimir-runner.sh job`. Every guest receives a unique cloud-init
instance ID, so it applies its own job seed. Without the image, guests fall
back to full provisioning.

`eimir-actions-image.timer` rebuilds the image every Sunday with current Ubuntu
security updates. A busy slot holds the launcher lock, and the service retries
every 15 minutes. Rebuild manually after changing `provision-eimir-runner.sh`
or the pinned runner version:

```bash
sudo /usr/local/sbin/eimir-actions-guest-probe image /var/lib/eimir-actions-vm/noble-amd64.qcow2
```

The image build guest uses 4 vCPUs and 3072 MiB while both slots are idle.
