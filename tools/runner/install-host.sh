#!/usr/bin/env bash
# Install the prepared runner image and 4-vCPU guests on eimir-dev (#2115).
# Run on the host while no Actions guest runs:
#   curl -fsSL https://raw.githubusercontent.com/baerenmarke90/eimir/<commit>/tools/runner/install-host.sh | sudo bash -s <commit>
# A full commit SHA pins every downloaded file to that exact revision.
set -euo pipefail

commit=${1:-}
if [[ ! $commit =~ ^[0-9a-f]{40}$ ]]; then
    echo "Usage: install-host.sh <full commit SHA>" >&2
    exit 1
fi
source_url=https://raw.githubusercontent.com/baerenmarke90/eimir/$commit/tools/runner
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

if systemctl is-active --quiet eimir-actions-network-probe.service; then
    echo "An Actions guest is running. Wait until it has finished." >&2
    exit 1
fi

for file in eimir-actions-guest-probe provision-eimir-runner.sh eimir-actions-image.service eimir-actions-image.timer; do
    curl -fsSL --proto '=https' "$source_url/$file" -o "$work/$file"
done

# Keep the current files for a one-command rollback.
cp -a /usr/local/sbin/eimir-actions-guest-probe /usr/local/sbin/eimir-actions-guest-probe.bak-2115
cp -a /etc/eimir-actions/provision-eimir-runner.sh /etc/eimir-actions/provision-eimir-runner.sh.bak-2115

install -m 0755 -o root -g root "$work/eimir-actions-guest-probe" /usr/local/sbin/eimir-actions-guest-probe
install -m 0644 -o root -g root "$work/provision-eimir-runner.sh" /etc/eimir-actions/provision-eimir-runner.sh
install -m 0644 -o root -g root "$work/eimir-actions-image.service" /etc/systemd/system/eimir-actions-image.service
install -m 0644 -o root -g root "$work/eimir-actions-image.timer" /etc/systemd/system/eimir-actions-image.timer
systemctl daemon-reload

# Pause the dispatcher so it cannot take the launcher lock during the build.
systemctl stop eimir-actions-dispatch.service
trap 'systemctl start eimir-actions-dispatch.service; rm -rf -- "$work"' EXIT
echo "Building the runner image (several minutes)..."
start=$(date +%s)
/usr/local/sbin/eimir-actions-guest-probe image /var/lib/eimir-actions-vm/noble-amd64.qcow2
echo "Image build took $(( ($(date +%s) - start) / 60 )) min $(( ($(date +%s) - start) % 60 )) s."
ls -l /var/lib/eimir-actions-vm/noble-eimir-runner.qcow2

systemctl enable --now eimir-actions-image.timer
systemctl list-timers eimir-actions-image.timer --no-pager
echo "Done. Rollback: restore the two .bak-2115 files and delete noble-eimir-runner.qcow2."
