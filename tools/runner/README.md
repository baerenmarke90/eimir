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

The script installs Docker and Compose, the CLI and media build dependencies,
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
