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
| `provision-eimir-runner.sh` | `/etc/eimir-actions/provision-eimir-runner.sh` (root, 0644) |
| `eimir-actions-image.service`, `eimir-actions-image.timer` | `/etc/systemd/system/` |

The dispatcher (`/usr/local/sbin/eimir-actions-dispatch`) and its environment
file `/etc/eimir-actions/dispatch.env` stay host-only. After #2115 merges, set
`EIMIR_NIGHTLY_MAIN_ENABLED=true` and `EIMIR_TEST_CHANNEL_MAIN_ENABLED=true`
there. Without them the runner does not pick up nightly jobs on `main` or
test-channel jobs.

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
security updates. A busy runner holds the launcher lock, and the service retries
every 15 minutes. Rebuild manually after changing `provision-eimir-runner.sh`
or the pinned runner version:

```bash
sudo /usr/local/sbin/eimir-actions-guest-probe image /var/lib/eimir-actions-vm/noble-amd64.qcow2
```

Nightly guests get 4 vCPUs (`CPUQuota=400%`) of the six-core host. PR guests keep 2.
