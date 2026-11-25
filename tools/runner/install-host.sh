#!/usr/bin/env bash
# Install the two-slot runner host files on eimir-dev (#2115).
# Run on the host while no Actions guest runs:
#   curl -fsSL https://raw.githubusercontent.com/baerenmarke90/eimir/<commit>/tools/runner/install-host.sh | sudo bash -s <commit>
# A full commit SHA pins every downloaded file to that exact revision. The same
# commit becomes the only branch revision the dispatcher admits for nightly
# validation runs (EIMIR_NIGHTLY_VALIDATION_SHA). Undo the installation with:
#   curl -fsSL https://raw.githubusercontent.com/baerenmarke90/eimir/<commit>/tools/runner/install-host.sh | sudo bash -s rollback
set -euo pipefail

state=/var/lib/eimir-actions-vm
env_file=/etc/eimir-actions/dispatch.env
backup=.bak-2115-slots
slot2_account=eimir-actions-vm2
launcher=/usr/local/sbin/eimir-actions-guest-probe
measure=/usr/local/sbin/eimir-actions-measure-guests
installed=(
    "$launcher"
    /usr/local/sbin/eimir-actions-dispatch
    /etc/eimir-actions/provision-eimir-runner.sh
    /etc/systemd/system/eimir-actions-image.service
    /etc/systemd/system/eimir-actions-image.timer
    "$env_file"
)

commit=${1:-}
if [[ $commit != rollback && ! $commit =~ ^[0-9a-f]{40}$ ]]; then
    echo "Usage: install-host.sh <full commit SHA> | rollback" >&2
    exit 1
fi

# Hold every launcher lock before touching anything. A running guest holds one
# of them (probe.lock belongs to the launcher before the two slots), so this
# fails instead of disturbing it, and no new guest starts until the script exits.
install -d -m 0755 "$state"
exec 7>"$state/probe.lock" 8>"$state/launcher.lock"
if ! flock -n -x 7 || ! flock -n -x 8 || pgrep -f qemu-system-x86_64 >/dev/null ||
   systemctl list-units --state=active --no-legend 'eimir-actions-network-probe*' | grep -q .; then
    echo "An Actions guest is running. Wait until it has finished, then run this again." >&2
    exit 1
fi

restart_dispatcher() {
    systemctl daemon-reload
    systemctl start eimir-actions-dispatch.service
    systemctl is-active eimir-actions-dispatch.service
}

if [[ $commit == rollback ]]; then
    if [[ ! -e $launcher$backup ]]; then
        echo "No backup $launcher$backup. Nothing was changed." >&2
        exit 1
    fi
    systemctl stop eimir-actions-dispatch.service
    trap restart_dispatcher EXIT
    for path in "${installed[@]}"; do
        if [[ -e $path$backup ]]; then
            cp -a -- "$path$backup" "$path"
        fi
    done
    rm -f -- "$measure"
    if [[ -f $state/nightly-toolcache-slot1.ext4 && ! -e $state/nightly-toolcache.ext4 ]]; then
        mv -T -- "$state/nightly-toolcache-slot1.ext4" "$state/nightly-toolcache.ext4"
    fi
    rm -f -- "$state/nightly-toolcache-slot2.ext4"
    echo "Rolled back to the files saved as *$backup. The unused $slot2_account account is kept."
    exit 0
fi

source_url=https://raw.githubusercontent.com/baerenmarke90/eimir/$commit/tools/runner
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
for file in eimir-actions-guest-probe eimir-actions-dispatch measure-guests.sh provision-eimir-runner.sh \
            eimir-actions-image.service eimir-actions-image.timer; do
    curl -fsSL --proto '=https' "$source_url/$file" -o "$work/$file" </dev/null
done
bash -n "$work/eimir-actions-guest-probe"
bash -n "$work/measure-guests.sh"
python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read())' "$work/eimir-actions-dispatch"
if ! grep -q '^EIMIR_NIGHTLY_VALIDATION_SHA=' "$env_file"; then
    echo "$env_file has no EIMIR_NIGHTLY_VALIDATION_SHA line. Nothing was changed." >&2
    exit 1
fi

systemctl stop eimir-actions-dispatch.service
trap 'restart_dispatcher; rm -rf -- "$work"' EXIT

# Keep the current files for a one-command rollback. An existing backup from an
# earlier run of this installer is never overwritten.
for path in "${installed[@]}"; do
    if [[ -e $path && ! -e $path$backup ]]; then
        cp -a -- "$path" "$path$backup"
    fi
done

install -m 0755 -o root -g root "$work/eimir-actions-guest-probe" "$launcher"
install -m 0755 -o root -g root "$work/eimir-actions-dispatch" /usr/local/sbin/eimir-actions-dispatch
install -m 0755 -o root -g root "$work/measure-guests.sh" "$measure"
install -m 0644 -o root -g root "$work/provision-eimir-runner.sh" /etc/eimir-actions/provision-eimir-runner.sh
install -m 0644 -o root -g root "$work/eimir-actions-image.service" /etc/systemd/system/eimir-actions-image.service
install -m 0644 -o root -g root "$work/eimir-actions-image.timer" /etc/systemd/system/eimir-actions-image.timer

# Slot 2 runs as its own account. The dispatcher's sandbox cannot create it.
if ! id "$slot2_account" >/dev/null 2>&1; then
    useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$slot2_account"
fi

# Slot 1 keeps the existing toolcache; slot 2 starts from a sparse copy of it.
if [[ -f $state/nightly-toolcache.ext4 && ! -e $state/nightly-toolcache-slot1.ext4 ]]; then
    mv -T -- "$state/nightly-toolcache.ext4" "$state/nightly-toolcache-slot1.ext4"
fi
if [[ -f $state/nightly-toolcache-slot1.ext4 && ! -e $state/nightly-toolcache-slot2.ext4 ]]; then
    echo "Copying the toolcache for slot 2 (about a minute)..."
    cp --sparse=always -- "$state/nightly-toolcache-slot1.ext4" "$state/.nightly-toolcache-slot2.ext4"
    chown "$slot2_account:$slot2_account" "$state/.nightly-toolcache-slot2.ext4"
    chmod 0600 "$state/.nightly-toolcache-slot2.ext4"
    mv -T -- "$state/.nightly-toolcache-slot2.ext4" "$state/nightly-toolcache-slot2.ext4"
fi

# Admit nightly validation runs of exactly this commit. No other line changes.
previous=$(sed -n 's/^EIMIR_NIGHTLY_VALIDATION_SHA=//p' "$env_file")
sed -i "s/^EIMIR_NIGHTLY_VALIDATION_SHA=.*/EIMIR_NIGHTLY_VALIDATION_SHA=$commit/" "$env_file"
echo "EIMIR_NIGHTLY_VALIDATION_SHA: $previous -> $commit"

systemctl enable --now eimir-actions-image.timer
ls -ls "$state"/nightly-toolcache-slot*.ext4
echo "Done. Two guest slots are installed; the dispatcher restarts now."
echo "Rollback: run this installer with 'rollback' instead of the commit."
